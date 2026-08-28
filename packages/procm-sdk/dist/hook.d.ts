import type { ProcmClient } from "./client.js";
import type { JsonValue } from "./protocol.js";
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
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
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
export declare function createHook<TFunction extends (...args: any[]) => any>(fn: TFunction, options?: CreateHookOptions): HookedFunction<TFunction>;
export declare function hookProperty<T extends object, K extends keyof T>(target: T, key: K, options?: PropertyHookOptions): () => void;
//# sourceMappingURL=hook.d.ts.map