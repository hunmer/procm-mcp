import {
  PROCM_PROTOCOL_VERSION,
  type ClientFrame,
  type JsonValue,
  type RoomMember,
  type RoomMessage,
  type ServerFrame,
  matchesTopic,
  parseServerFrame,
} from "./protocol.js";

type ConnectionState = "connecting" | "open" | "closed";
type MessageHandler = (message: RoomMessage) => void;
type MemberHandler = (event: "joined" | "left" | "replaced", member: RoomMember) => void;
type StateHandler = (state: ConnectionState) => void;

interface PendingTraceRequest {
  resolve: (traceId: string) => void;
  reject: (error: Error) => void;
}

export interface ProcmClientOptions {
  url?: string;
  roomId?: string;
  processId?: string;
  clientName?: string;
  memberId?: string;
  token?: string;
  metadata?: Record<string, JsonValue>;
  reconnect?: boolean;
  webSocketFactory?: (url: string, protocols?: string[]) => WebSocket;
}

export interface SubscribeOptions {
  prefix?: boolean;
}

export interface PublishOptions {
  retain?: boolean;
  correlationId?: string;
}

export interface WaitForOptions<T = JsonValue> {
  prefix?: boolean;
  filter?: (payload: T, message: RoomMessage<T>) => boolean;
  timeout?: number;
  signal?: AbortSignal;
}

interface Subscription {
  id: string;
  topic: string;
  prefix: boolean;
  handler: MessageHandler;
}

function env(name: string): string | undefined {
  const processLike = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.[name];
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export class ProcmClient {
  readonly roomId: string;
  readonly processId?: string;
  readonly clientName: string;
  readonly memberId: string;
  private readonly options: ProcmClientOptions;
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly memberHandlers = new Set<MemberHandler>();
  private readonly stateHandlers = new Set<StateHandler>();
  private readonly pendingTraceRequests = new Map<string, PendingTraceRequest>();
  private socket: WebSocket | null = null;
  private disposed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private state: ConnectionState = "closed";

  constructor(options: ProcmClientOptions = {}) {
    this.options = options;
    this.roomId = options.roomId ?? env("PROCM_ROOM_ID") ?? "";
    this.processId = options.processId ?? env("PROCM_PROCESS_ID");
    this.clientName = options.clientName ?? env("PROCM_CLIENT_NAME") ?? "client";
    this.memberId = options.memberId ?? (this.processId ? `${this.processId}:${this.clientName}` : `${this.clientName}:${randomId()}`);
    if (!this.roomId) throw new Error("procm roomId is required");
    queueMicrotask(() => this.connect());
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  get pendingTraceRequestCount(): number {
    return this.pendingTraceRequests.size;
  }

  // Resolved WebSocket connection target (raw URL + optional auth token) as
  // used by connect(). Exposed so companion transports, e.g. the MCP HTTP
  // endpoint derived in trace.ts, can reach the same backend.
  get connectionTarget(): { url: string; token?: string } {
    return {
      url: this.options.url ?? env("PROCM_WS_URL") ?? "",
      token: this.options.token ?? env("PROCM_HTTP_TOKEN"),
    };
  }

  connect(): void {
    if (this.disposed || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    const rawUrl = this.options.url ?? env("PROCM_WS_URL");
    if (!rawUrl) throw new Error("procm WebSocket URL is required");
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

  subscribe(topic: string, handler: MessageHandler, options: SubscribeOptions = {}): () => void {
    if (!topic) throw new Error("subscription topic is required");
    const subscription: Subscription = { id: randomId(), topic, prefix: options.prefix === true, handler };
    this.subscriptions.set(subscription.id, subscription);
    if (this.state === "open") this.sendSubscription(subscription);
    return () => {
      if (!this.subscriptions.delete(subscription.id)) return;
      this.send({ version: PROCM_PROTOCOL_VERSION, type: "unsubscribe", subscriptionId: subscription.id });
    };
  }

  publish(topic: string, payload: JsonValue, options: PublishOptions = {}): string {
    if (!topic) throw new Error("publish topic is required");
    const messageId = randomId();
    this.send({
      version: PROCM_PROTOCOL_VERSION,
      type: "publish",
      messageId,
      topic,
      timestamp: Date.now(),
      payload,
      retain: options.retain,
      correlationId: options.correlationId,
    });
    return messageId;
  }

  waitFor<T extends JsonValue = JsonValue>(topic: string, options: WaitForOptions<T> = {}): Promise<RoomMessage<T>> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = this.subscribe(topic, (message) => {
        const typed = message as RoomMessage<T>;
        if (options.filter && !options.filter(typed.payload, typed)) return;
        finish(() => resolve(typed));
      }, { prefix: options.prefix });
      const onAbort = () => finish(() => reject(new DOMException("waitFor aborted", "AbortError")));
      const finish = (done: () => void) => {
        cleanup();
        if (timer) clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        done();
      };
      if (options.signal?.aborted) return onAbort();
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.timeout !== undefined) {
        timer = setTimeout(() => finish(() => reject(new Error(`waitFor timed out after ${options.timeout}ms`))), options.timeout);
      }
    });
  }

  onMember(handler: MemberHandler): () => void {
    this.memberHandlers.add(handler);
    return () => this.memberHandlers.delete(handler);
  }

  onState(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
  }

  close(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.socket?.close(1000, "client disposed");
    this.socket = null;
    this.rejectPendingTraceRequests(new Error("procm client closed"));
    this.setState("closed");
  }

  requestTraceStore(
    requestId: string,
    traceId: string,
    payload: JsonValue,
    ttlSeconds: number | undefined,
  ): Promise<string> {
    if (this.state !== "open") return Promise.reject(new Error("procm client is not connected"));
    return new Promise((resolve, reject) => {
      this.pendingTraceRequests.set(requestId, { resolve, reject });
      try {
        this.send({
          version: PROCM_PROTOCOL_VERSION,
          type: "trace:put",
          requestId,
          traceId,
          ttlSeconds,
          payload,
        });
      } catch (error) {
        this.pendingTraceRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  cancelTraceStore(requestId: string, error: Error): void {
    const pending = this.pendingTraceRequests.get(requestId);
    if (!pending) return;
    this.pendingTraceRequests.delete(requestId);
    pending.reject(error);
  }

  private handleMessage(raw: unknown): void {
    try {
      const text = typeof raw === "string" ? raw : raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : String(raw);
      const frame = parseServerFrame(JSON.parse(text));
      if (!frame) return;
      if (frame.type === "welcome") {
        this.setState("open");
        for (const subscription of this.subscriptions.values()) this.sendSubscription(subscription);
      } else if (frame.type === "message") {
        for (const subscription of this.subscriptions.values()) {
          if (matchesTopic(frame.topic, subscription.topic, subscription.prefix)) subscription.handler(frame);
        }
      } else if (frame.type === "member") {
        for (const handler of this.memberHandlers) handler(frame.event, frame.member);
      } else if (frame.type === "trace:stored") {
        const pending = this.pendingTraceRequests.get(frame.requestId);
        if (pending) {
          this.pendingTraceRequests.delete(frame.requestId);
          pending.resolve(frame.traceId);
        }
      } else if (frame.type === "error" && frame.requestId) {
        const pending = this.pendingTraceRequests.get(frame.requestId);
        if (pending) {
          this.pendingTraceRequests.delete(frame.requestId);
          const error = new Error(frame.message) as Error & { code?: string };
          error.code = frame.code;
          pending.reject(error);
        }
      }
    } catch {
      // Malformed frames are ignored; the server remains authoritative.
    }
  }

  private handleClose(socket: WebSocket): void {
    if (socket !== this.socket) return;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.socket = null;
    this.rejectPendingTraceRequests(new Error("procm WebSocket closed"));
    this.setState("closed");
    if (!this.disposed && this.options.reconnect !== false) {
      const base = Math.min(500 * 2 ** this.reconnectAttempt++, 10_000);
      const delay = Math.round(base * (0.8 + Math.random() * 0.4));
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
  }

  private send(frame: ClientFrame): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      if (frame.type === "publish") throw new Error("procm client is not connected");
      return;
    }
    this.socket.send(JSON.stringify(frame));
  }

  private sendSubscription(subscription: Subscription): void {
    this.send({
      version: PROCM_PROTOCOL_VERSION,
      type: "subscribe",
      subscriptionId: subscription.id,
      topic: subscription.topic,
      prefix: subscription.prefix,
    });
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const handler of this.stateHandlers) handler(state);
  }

  private rejectPendingTraceRequests(error: Error): void {
    for (const pending of this.pendingTraceRequests.values()) pending.reject(error);
    this.pendingTraceRequests.clear();
  }
}

function appendToken(rawUrl: string, token: string): string {
  const url = new URL(rawUrl);
  if (!url.searchParams.has("token")) url.searchParams.set("token", token);
  return url.toString();
}

export function createProcmClient(options: ProcmClientOptions = {}): ProcmClient {
  return new ProcmClient(options);
}
