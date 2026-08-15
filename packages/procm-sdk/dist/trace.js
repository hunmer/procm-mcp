export const TRACE_MAX_BYTES = 262_144;
export const TRACE_MIN_TTL_SECONDS = 1;
export const TRACE_MAX_TTL_SECONDS = 604_800;
function randomId() {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function byteLength(value) {
    return new TextEncoder().encode(value).byteLength;
}
function validateData(data) {
    let serialized;
    try {
        serialized = JSON.stringify(data);
    }
    catch {
        throw new Error("trace data must be JSON serializable");
    }
    if (serialized === undefined)
        throw new Error("trace data must be JSON serializable");
    if (byteLength(serialized) > TRACE_MAX_BYTES) {
        throw new Error(`trace data exceeds ${TRACE_MAX_BYTES} bytes`);
    }
}
export async function saveTrace(client, data, options = {}) {
    if (client.connectionState !== "open")
        throw new Error("procm client is not connected");
    if (options.ttlSeconds !== undefined &&
        (!Number.isInteger(options.ttlSeconds) || options.ttlSeconds < TRACE_MIN_TTL_SECONDS || options.ttlSeconds > TRACE_MAX_TTL_SECONDS)) {
        throw new Error(`trace ttlSeconds must be an integer from ${TRACE_MIN_TTL_SECONDS} to ${TRACE_MAX_TTL_SECONDS}`);
    }
    validateData(data);
    if (options.signal?.aborted)
        throw new DOMException("trace save aborted", "AbortError");
    const attempts = options.id === undefined ? 3 : 1;
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt++) {
        const traceId = options.id ?? randomId();
        const requestId = randomId();
        let timer;
        let onAbort;
        try {
            const request = client.requestTraceStore(requestId, traceId, data, options.ttlSeconds);
            const guarded = new Promise((resolve, reject) => {
                const finish = (done) => {
                    if (timer)
                        clearTimeout(timer);
                    if (onAbort)
                        options.signal?.removeEventListener("abort", onAbort);
                    done();
                };
                request.then((id) => finish(() => resolve(id)), (error) => finish(() => reject(error)));
                onAbort = () => {
                    const error = new DOMException("trace save aborted", "AbortError");
                    client.cancelTraceStore(requestId, error);
                };
                options.signal?.addEventListener("abort", onAbort, { once: true });
                const timeout = options.timeout ?? 10_000;
                timer = setTimeout(() => {
                    const error = new Error(`trace request timed out after ${timeout}ms`);
                    error.code = "TRACE_REQUEST_TIMEOUT";
                    client.cancelTraceStore(requestId, error);
                }, timeout);
            });
            return await guarded;
        }
        catch (error) {
            lastError = error;
            if (error.code !== "TRACE_STORE_CONFLICT" || options.id !== undefined)
                throw error;
        }
    }
    throw lastError;
}
// ---------------------------------------------------------------------------
// Reading traces back through the backend's HTTP Stream MCP (trace-get tool).
// ---------------------------------------------------------------------------
const MCP_PROTOCOL_VERSION = "2025-06-18";
const mcpSessions = new WeakMap();
function mcpEndpoint(client) {
    const { url, token } = client.connectionTarget;
    if (!url)
        throw new Error("procm WebSocket URL is required to resolve the MCP endpoint");
    const httpUrl = new URL(url);
    httpUrl.protocol = httpUrl.protocol === "wss:" ? "https:" : "http:";
    httpUrl.pathname = "/mcp";
    httpUrl.search = "";
    return { url: httpUrl.toString(), token };
}
async function mcpPost(endpoint, body, timeout, signal) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeout);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
        const headers = {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
        };
        if (endpoint.token)
            headers.Authorization = `Bearer ${endpoint.token}`;
        const response = await fetch(endpoint.url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!response.ok)
            throw new Error(`MCP HTTP request failed with status ${response.status}`);
        return await response.text();
    }
    catch (error) {
        if (timedOut)
            throw new Error(`MCP request timed out after ${timeout}ms`);
        throw error;
    }
    finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
    }
}
async function mcpFetch(endpoint, body, timeout, signal) {
    const text = await mcpPost(endpoint, body, timeout, signal);
    // Streamable HTTP replies as SSE data lines; fall back to plain JSON.
    for (const line of text.split("\n")) {
        if (!line.startsWith("data: "))
            continue;
        try {
            return JSON.parse(line.slice(6));
        }
        catch { /* skip malformed data line */ }
    }
    return JSON.parse(text);
}
async function ensureMcpSession(client, timeout, signal) {
    let session = mcpSessions.get(client);
    if (!session) {
        const endpoint = mcpEndpoint(client);
        session = (async () => {
            await mcpFetch(endpoint, {
                jsonrpc: "2.0",
                id: randomId(),
                method: "initialize",
                params: {
                    protocolVersion: MCP_PROTOCOL_VERSION,
                    capabilities: {},
                    clientInfo: { name: "procm-sdk", version: "1.0" },
                },
            }, timeout, signal);
            // A JSON-RPC notification gets no response body, so send it raw.
            await mcpPost(endpoint, {
                jsonrpc: "2.0",
                method: "notifications/initialized",
            }, timeout, signal);
        })().catch((error) => {
            mcpSessions.delete(client);
            throw error;
        });
        mcpSessions.set(client, session);
    }
    return session;
}
// Fetch a stored trace by ID through the same procm-mcp instance the client is
// connected to. Throws when the trace is unknown, expired or evicted.
export async function getTrace(client, id, options = {}) {
    if (!id || typeof id !== "string")
        throw new Error("trace id is required");
    const timeout = options.timeout ?? 10_000;
    await ensureMcpSession(client, timeout, options.signal);
    const response = await mcpFetch(mcpEndpoint(client), {
        jsonrpc: "2.0",
        id: randomId(),
        method: "tools/call",
        params: { name: "trace-get", arguments: { id } },
    }, timeout, options.signal);
    if (response.error)
        throw new Error(`MCP tools/call failed: ${response.error.message ?? "unknown MCP error"}`);
    const text = response.result?.content?.find((part) => part.type === "text")?.text;
    let payload;
    try {
        payload = text === undefined ? undefined : JSON.parse(text);
    }
    catch {
        throw new Error("trace-get returned a malformed payload");
    }
    if (!payload?.ok || !payload.trace) {
        const detail = payload?.error;
        throw new Error(typeof detail === "string" ? detail
            : detail && typeof detail === "object" ? `${detail.code ?? "TRACE_ERROR"}: ${detail.message ?? "no message"}`
                : `trace "${id}" was not found`);
    }
    return payload.trace;
}
//# sourceMappingURL=trace.js.map