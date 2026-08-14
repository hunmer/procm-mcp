import { PROCM_PROTOCOL_VERSION, matchesTopic, parseServerFrame, } from "./protocol.js";
function env(name) {
    const processLike = globalThis.process;
    return processLike?.env?.[name];
}
function randomId() {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export class ProcmClient {
    roomId;
    processId;
    clientName;
    memberId;
    options;
    subscriptions = new Map();
    memberHandlers = new Set();
    stateHandlers = new Set();
    socket = null;
    disposed = false;
    reconnectAttempt = 0;
    reconnectTimer = null;
    heartbeatTimer = null;
    state = "closed";
    constructor(options = {}) {
        this.options = options;
        this.roomId = options.roomId ?? env("PROCM_ROOM_ID") ?? "";
        this.processId = options.processId ?? env("PROCM_PROCESS_ID");
        this.clientName = options.clientName ?? env("PROCM_CLIENT_NAME") ?? "client";
        this.memberId = options.memberId ?? (this.processId ? `${this.processId}:${this.clientName}` : `${this.clientName}:${randomId()}`);
        if (!this.roomId)
            throw new Error("procm roomId is required");
        queueMicrotask(() => this.connect());
    }
    get connectionState() {
        return this.state;
    }
    connect() {
        if (this.disposed || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING)
            return;
        const rawUrl = this.options.url ?? env("PROCM_WS_URL");
        if (!rawUrl)
            throw new Error("procm WebSocket URL is required");
        const token = this.options.token ?? env("PROCM_HTTP_TOKEN");
        const url = token ? appendToken(rawUrl, token) : rawUrl;
        const factory = this.options.webSocketFactory ?? ((target, protocols) => new WebSocket(target, protocols));
        this.setState("connecting");
        const ws = factory(url, token ? [`bearer.${token}`] : undefined);
        this.socket = ws;
        ws.addEventListener("open", () => {
            this.reconnectAttempt = 0;
            this.send({
                version: PROCM_PROTOCOL_VERSION,
                type: "hello",
                roomId: this.roomId,
                memberId: this.memberId,
                clientName: this.clientName,
                processId: this.processId,
                metadata: this.options.metadata,
            });
            this.heartbeatTimer = setInterval(() => {
                this.send({ version: PROCM_PROTOCOL_VERSION, type: "ping", timestamp: Date.now() });
            }, 20_000);
        });
        ws.addEventListener("message", (event) => this.handleMessage(event.data));
        ws.addEventListener("close", () => this.handleClose(ws));
        ws.addEventListener("error", () => ws.close());
    }
    subscribe(topic, handler, options = {}) {
        if (!topic)
            throw new Error("subscription topic is required");
        const subscription = { id: randomId(), topic, prefix: options.prefix === true, handler };
        this.subscriptions.set(subscription.id, subscription);
        if (this.state === "open")
            this.sendSubscription(subscription);
        return () => {
            if (!this.subscriptions.delete(subscription.id))
                return;
            this.send({ version: PROCM_PROTOCOL_VERSION, type: "unsubscribe", subscriptionId: subscription.id });
        };
    }
    publish(topic, payload, options = {}) {
        if (!topic)
            throw new Error("publish topic is required");
        const messageId = randomId();
        this.send({
            version: PROCM_PROTOCOL_VERSION,
            type: "publish",
            messageId,
            topic,
            timestamp: Date.now(),
            payload,
            retain: options.retain,
        });
        return messageId;
    }
    waitFor(topic, options = {}) {
        return new Promise((resolve, reject) => {
            let timer = null;
            const cleanup = this.subscribe(topic, (message) => {
                const typed = message;
                if (options.filter && !options.filter(typed.payload, typed))
                    return;
                finish(() => resolve(typed));
            }, { prefix: options.prefix });
            const onAbort = () => finish(() => reject(new DOMException("waitFor aborted", "AbortError")));
            const finish = (done) => {
                cleanup();
                if (timer)
                    clearTimeout(timer);
                options.signal?.removeEventListener("abort", onAbort);
                done();
            };
            if (options.signal?.aborted)
                return onAbort();
            options.signal?.addEventListener("abort", onAbort, { once: true });
            if (options.timeout !== undefined) {
                timer = setTimeout(() => finish(() => reject(new Error(`waitFor timed out after ${options.timeout}ms`))), options.timeout);
            }
        });
    }
    onMember(handler) {
        this.memberHandlers.add(handler);
        return () => this.memberHandlers.delete(handler);
    }
    onState(handler) {
        this.stateHandlers.add(handler);
        handler(this.state);
        return () => this.stateHandlers.delete(handler);
    }
    close() {
        this.disposed = true;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        if (this.heartbeatTimer)
            clearInterval(this.heartbeatTimer);
        this.socket?.close(1000, "client disposed");
        this.socket = null;
        this.setState("closed");
    }
    handleMessage(raw) {
        try {
            const text = typeof raw === "string" ? raw : raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : String(raw);
            const frame = parseServerFrame(JSON.parse(text));
            if (!frame)
                return;
            if (frame.type === "welcome") {
                this.setState("open");
                for (const subscription of this.subscriptions.values())
                    this.sendSubscription(subscription);
            }
            else if (frame.type === "message") {
                for (const subscription of this.subscriptions.values()) {
                    if (matchesTopic(frame.topic, subscription.topic, subscription.prefix))
                        subscription.handler(frame);
                }
            }
            else if (frame.type === "member") {
                for (const handler of this.memberHandlers)
                    handler(frame.event, frame.member);
            }
        }
        catch {
            // Malformed frames are ignored; the server remains authoritative.
        }
    }
    handleClose(socket) {
        if (socket !== this.socket)
            return;
        if (this.heartbeatTimer)
            clearInterval(this.heartbeatTimer);
        this.socket = null;
        this.setState("closed");
        if (!this.disposed && this.options.reconnect !== false) {
            const base = Math.min(500 * 2 ** this.reconnectAttempt++, 10_000);
            const delay = Math.round(base * (0.8 + Math.random() * 0.4));
            this.reconnectTimer = setTimeout(() => this.connect(), delay);
        }
    }
    send(frame) {
        if (this.socket?.readyState !== WebSocket.OPEN) {
            if (frame.type === "publish")
                throw new Error("procm client is not connected");
            return;
        }
        this.socket.send(JSON.stringify(frame));
    }
    sendSubscription(subscription) {
        this.send({
            version: PROCM_PROTOCOL_VERSION,
            type: "subscribe",
            subscriptionId: subscription.id,
            topic: subscription.topic,
            prefix: subscription.prefix,
        });
    }
    setState(state) {
        if (this.state === state)
            return;
        this.state = state;
        for (const handler of this.stateHandlers)
            handler(state);
    }
}
function appendToken(rawUrl, token) {
    const url = new URL(rawUrl);
    if (!url.searchParams.has("token"))
        url.searchParams.set("token", token);
    return url.toString();
}
export function createProcmClient(options = {}) {
    return new ProcmClient(options);
}
//# sourceMappingURL=client.js.map