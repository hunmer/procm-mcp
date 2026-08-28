import callsites from "callsites";
import { saveTrace } from "./trace.js";
function randomId() {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function captureCallChain(filterFrame) {
    const frames = callsites()
        .map((site, index) => ({
        index,
        functionName: site.getFunctionName() ?? site.getMethodName() ?? "<anonymous>",
        file: site.getFileName() ?? "<unknown>",
        line: site.getLineNumber(),
        column: site.getColumnNumber(),
        async: site.isAsync(),
    }))
        .filter((frame) => !frame.file.endsWith("/hook.js") && !frame.file.endsWith("/hook.ts"))
        .filter((frame) => filterFrame?.(frame) ?? true)
        .slice(0, 100)
        .map((frame, index) => ({ ...frame, index }));
    return frames;
}
function jsonValueOrPlaceholder(value) {
    try {
        const text = JSON.stringify(value);
        if (text === undefined)
            return { unavailable: "not JSON serializable" };
        return JSON.parse(text);
    }
    catch {
        return { unavailable: "not JSON serializable" };
    }
}
function errorDetails(error) {
    if (error instanceof Error)
        return { name: error.name, message: error.message, stack: error.stack };
    return { name: "Error", message: String(error) };
}
function assertSynchronous(result, phase) {
    if (result !== null && (typeof result === "object" || typeof result === "function") &&
        typeof result.then === "function") {
        throw new Error(`${phase} hook handlers must be synchronous`);
    }
}
function store(options, trace) {
    if (!options.client)
        return;
    void saveTrace(options.client, trace, { id: trace.traceId, ttlSeconds: options.ttlSeconds })
        .then((id) => options.onStored?.(id))
        .catch((error) => options.onStoreError?.(error instanceof Error ? error : new Error(String(error)), trace.traceId));
}
export function createHook(fn, options = {}) {
    if (typeof fn !== "function")
        throw new TypeError("createHook requires a function");
    const beforeHandlers = [];
    const afterHandlers = [];
    const hooked = function (...initialArgs) {
        const traceId = randomId();
        const startedAt = Date.now();
        const started = performance.now();
        const callChain = captureCallChain(options.filterFrame);
        let args = initialArgs;
        let skipped = false;
        let currentResult;
        options.onTraceCreated?.(traceId);
        for (const handler of beforeHandlers) {
            const returned = handler({
                traceId,
                args,
                callChain,
                setArgs(next) { args = next; },
                skip(result) { skipped = true; currentResult = result; },
            });
            assertSynchronous(returned, "before");
        }
        const complete = (status, result, error) => {
            currentResult = result;
            for (const handler of afterHandlers) {
                const returned = handler({
                    traceId,
                    args,
                    result: currentResult,
                    error,
                    callChain,
                    setResult(next) { currentResult = next; },
                });
                assertSynchronous(returned, "after");
            }
            const trace = {
                kind: "function",
                traceId,
                name: options.name ?? fn.name ?? "<anonymous>",
                startedAt,
                durationMs: performance.now() - started,
                status,
                callChain,
            };
            if (options.captureArgs)
                trace.args = jsonValueOrPlaceholder(args);
            if (options.captureResult && error === undefined)
                trace.result = jsonValueOrPlaceholder(currentResult);
            if (error !== undefined)
                trace.error = errorDetails(error);
            store(options, trace);
            return currentResult;
        };
        if (skipped)
            return complete("skipped", currentResult);
        let result;
        try {
            result = fn.apply(this, args);
        }
        catch (error) {
            complete("threw", undefined, error);
            throw error;
        }
        if (result !== null && (typeof result === "object" || typeof result === "function") &&
            typeof result.then === "function") {
            return Promise.resolve(result).then((value) => complete("resolved", value), (error) => {
                complete("rejected", undefined, error);
                throw error;
            });
        }
        return complete("returned", result);
    };
    Object.defineProperties(hooked, {
        original: { value: fn, enumerable: true },
        before: { value: (handler) => { beforeHandlers.push(handler); return hooked; } },
        after: { value: (handler) => { afterHandlers.push(handler); return hooked; } },
    });
    return hooked;
}
export function hookProperty(target, key, options = {}) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (!descriptor)
        throw new Error(`property ${String(key)} must be an own property`);
    if (!descriptor.configurable)
        throw new Error(`property ${String(key)} must be configurable`);
    let restored = false;
    let currentValue = descriptor.value;
    const originalGet = descriptor.get;
    const originalSet = descriptor.set;
    const getValue = function () {
        return originalGet ? originalGet.call(this) : currentValue;
    };
    const setValue = function (value) {
        if (originalSet)
            originalSet.call(this, value);
        else if ("writable" in descriptor && descriptor.writable)
            currentValue = value;
    };
    const hookedGet = options.captureGet === false
        ? getValue
        : createHook(getValue, { ...options, name: options.name ?? `${String(key)}:get`, captureResult: options.captureResult ?? true });
    const hookedSet = options.captureSet === false
        ? setValue
        : createHook(setValue, { ...options, name: options.name ?? `${String(key)}:set`, captureArgs: options.captureArgs ?? true });
    Object.defineProperty(target, key, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: hookedGet,
        set: originalSet || ("writable" in descriptor && descriptor.writable) ? hookedSet : undefined,
    });
    return () => {
        if (restored)
            return;
        restored = true;
        const restoredDescriptor = "value" in descriptor ? { ...descriptor, value: currentValue } : descriptor;
        Object.defineProperty(target, key, restoredDescriptor);
    };
}
//# sourceMappingURL=hook.js.map