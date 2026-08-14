const CUSTOM_EXECUTION_TOPIC = "$procm/custom-execution";
export class CustomExecutionError extends Error {
    constructor(name, message) {
        super(message);
        this.name = name;
    }
}
export function exposeCustomExecution(client, options = {}) {
    if (client.connectionState !== "open") {
        throw new Error("custom execution can only be exposed after the procm client is connected");
    }
    const target = options.target ?? client.clientName;
    if (!target)
        throw new Error("custom execution target is required");
    return client.subscribe(customExecutionRequestTopic(target), (message) => {
        void handleRequest(client, message.payload, options.context);
    });
}
export async function executeCustom(client, target, execute, args = [], options = {}) {
    if (client.connectionState !== "open") {
        throw new Error("custom execution requires a connected procm client");
    }
    if (!target)
        throw new Error("custom execution target is required");
    if (typeof execute !== "function")
        throw new Error("custom execution function is required");
    const requestId = randomId();
    const replyTopic = `${CUSTOM_EXECUTION_TOPIC}/result/${encodeURIComponent(client.memberId)}/${requestId}`;
    const resultPromise = client.waitFor(replyTopic, {
        timeout: options.timeout ?? 5_000,
        signal: options.signal,
        filter: (payload) => payload.requestId === requestId,
    });
    client.publish(customExecutionRequestTopic(target), {
        requestId,
        replyTopic,
        source: execute.toString(),
        args,
    });
    const result = (await resultPromise).payload;
    if (!result.ok)
        throw new CustomExecutionError(result.error.name, result.error.message);
    return result.value;
}
async function handleRequest(client, payload, context) {
    if (!isCustomExecutionRequest(payload))
        return;
    try {
        const execute = evaluateFunction(payload.source);
        const value = toJsonValue(await execute(context, ...payload.args));
        client.publish(payload.replyTopic, { requestId: payload.requestId, ok: true, value });
    }
    catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        client.publish(payload.replyTopic, {
            requestId: payload.requestId,
            ok: false,
            error: { name: normalized.name, message: normalized.message },
        });
    }
}
function evaluateFunction(source) {
    const evaluate = eval;
    const value = evaluate(`(${source})`);
    if (typeof value !== "function")
        throw new Error("custom execution source must evaluate to a function");
    return value;
}
function toJsonValue(value) {
    if (value === undefined)
        return null;
    const serialized = JSON.stringify(value);
    if (serialized === undefined)
        return null;
    return JSON.parse(serialized);
}
function customExecutionRequestTopic(target) {
    return `${CUSTOM_EXECUTION_TOPIC}/request/${encodeURIComponent(target)}`;
}
function isCustomExecutionRequest(value) {
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof value.requestId === "string" &&
        typeof value.replyTopic === "string" &&
        typeof value.source === "string" &&
        Array.isArray(value.args);
}
function randomId() {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
//# sourceMappingURL=custom-execution.js.map