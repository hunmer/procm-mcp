import callsites from "callsites";
import type { ProcmClient } from "./client.js";
import type { JsonValue } from "./protocol.js";
import { saveTrace } from "./trace.js";

export interface TraceFrame {
  index: number;
  functionName: string;
  file: string;
  line: number | null;
  column: number | null;
  async: boolean;
}

export interface FunctionTrace {
  kind: "function";
  traceId: string;
  name: string;
  startedAt: number;
  durationMs: number;
  status: "returned" | "resolved" | "threw" | "rejected" | "skipped";
  callChain: TraceFrame[];
  args?: JsonValue;
  result?: JsonValue;
  error?: { name: string; message: string; stack?: string };
}

export interface CreateHookOptions {
  client?: ProcmClient;
  name?: string;
  captureArgs?: boolean;
  captureResult?: boolean;
  ttlSeconds?: number;
  filterFrame?: (frame: TraceFrame) => boolean;
  onTraceCreated?: (traceId: string) => void;
  onStored?: (traceId: string) => void;
  onStoreError?: (error: Error, traceId: string) => void;
}

export interface BeforeHookContext {
  traceId: string;
  args: unknown[];
  callChain: TraceFrame[];
  setArgs(args: unknown[]): void;
  skip(result?: unknown): void;
}

export interface AfterHookContext {
  traceId: string;
  args: unknown[];
  result: unknown;
  error?: unknown;
  callChain: TraceFrame[];
  setResult(result: unknown): void;
}

export type BeforeHookHandler = (context: BeforeHookContext) => void;
export type AfterHookHandler = (context: AfterHookContext) => void;

export type HookedFunction<TFunction extends (...args: any[]) => any> = TFunction & {
  before(handler: BeforeHookHandler): HookedFunction<TFunction>;
  after(handler: AfterHookHandler): HookedFunction<TFunction>;
  readonly original: TFunction;
};

export interface PropertyHookOptions extends CreateHookOptions {
  captureGet?: boolean;
  captureSet?: boolean;
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function captureCallChain(filterFrame?: (frame: TraceFrame) => boolean): TraceFrame[] {
  const frames = callsites()
    .map((site, index): TraceFrame => ({
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

function jsonValueOrPlaceholder(value: unknown): JsonValue {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return { unavailable: "not JSON serializable" };
    return JSON.parse(text) as JsonValue;
  } catch {
    return { unavailable: "not JSON serializable" };
  }
}

function errorDetails(error: unknown): FunctionTrace["error"] {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: "Error", message: String(error) };
}

function assertSynchronous(result: unknown, phase: "before" | "after"): void {
  if (result !== null && (typeof result === "object" || typeof result === "function") &&
      typeof (result as { then?: unknown }).then === "function") {
    throw new Error(`${phase} hook handlers must be synchronous`);
  }
}

function store(options: CreateHookOptions, trace: FunctionTrace): void {
  if (!options.client) return;
  void saveTrace(options.client, trace as unknown as JsonValue, { id: trace.traceId, ttlSeconds: options.ttlSeconds })
    .then((id) => options.onStored?.(id))
    .catch((error: unknown) => options.onStoreError?.(error instanceof Error ? error : new Error(String(error)), trace.traceId));
}

export function createHook<TFunction extends (...args: any[]) => any>(
  fn: TFunction,
  options: CreateHookOptions = {},
): HookedFunction<TFunction> {
  if (typeof fn !== "function") throw new TypeError("createHook requires a function");
  const beforeHandlers: BeforeHookHandler[] = [];
  const afterHandlers: AfterHookHandler[] = [];

  const hooked = function (this: unknown, ...initialArgs: unknown[]) {
    const traceId = randomId();
    const startedAt = Date.now();
    const started = performance.now();
    const callChain = captureCallChain(options.filterFrame);
    let args = initialArgs;
    let skipped = false;
    let currentResult: unknown;
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

    const complete = (
      status: FunctionTrace["status"],
      result: unknown,
      error?: unknown,
    ): unknown => {
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
      const trace: FunctionTrace = {
        kind: "function",
        traceId,
        name: options.name ?? fn.name ?? "<anonymous>",
        startedAt,
        durationMs: performance.now() - started,
        status,
        callChain,
      };
      if (options.captureArgs) trace.args = jsonValueOrPlaceholder(args);
      if (options.captureResult && error === undefined) trace.result = jsonValueOrPlaceholder(currentResult);
      if (error !== undefined) trace.error = errorDetails(error);
      store(options, trace);
      return currentResult;
    };

    if (skipped) return complete("skipped", currentResult);

    let result: ReturnType<TFunction>;
    try {
      result = fn.apply(this, args as Parameters<TFunction>);
    } catch (error) {
      complete("threw", undefined, error);
      throw error;
    }
    if (result !== null && (typeof result === "object" || typeof result === "function") &&
        typeof (result as { then?: unknown }).then === "function") {
      return Promise.resolve(result).then(
        (value) => complete("resolved", value),
        (error) => {
          complete("rejected", undefined, error);
          throw error;
        },
      );
    }
    return complete("returned", result);
  } as TFunction;

  Object.defineProperties(hooked, {
    original: { value: fn, enumerable: true },
    before: { value: (handler: BeforeHookHandler) => { beforeHandlers.push(handler); return hooked; } },
    after: { value: (handler: AfterHookHandler) => { afterHandlers.push(handler); return hooked; } },
  });
  return hooked as HookedFunction<TFunction>;
}

export function hookProperty<T extends object, K extends keyof T>(
  target: T,
  key: K,
  options: PropertyHookOptions = {},
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) throw new Error(`property ${String(key)} must be an own property`);
  if (!descriptor.configurable) throw new Error(`property ${String(key)} must be configurable`);

  let restored = false;
  let currentValue = descriptor.value;
  const originalGet = descriptor.get;
  const originalSet = descriptor.set;
  const getValue = function (this: T): unknown {
    return originalGet ? originalGet.call(this) : currentValue;
  };
  const setValue = function (this: T, value: unknown): void {
    if (originalSet) originalSet.call(this, value);
    else if ("writable" in descriptor && descriptor.writable) currentValue = value;
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
    if (restored) return;
    restored = true;
    const restoredDescriptor = "value" in descriptor ? { ...descriptor, value: currentValue } : descriptor;
    Object.defineProperty(target, key, restoredDescriptor);
  };
}
