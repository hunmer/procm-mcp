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
//# sourceMappingURL=trace.js.map