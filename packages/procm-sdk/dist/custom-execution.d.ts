import { type ProcmClient } from "./client.js";
import { type JsonValue } from "./protocol.js";
export type CustomExecutionFunction<TContext = unknown, TResult = JsonValue> = (context: TContext, ...args: JsonValue[]) => TResult | Promise<TResult>;
export interface ExposeCustomExecutionOptions<TContext = unknown> {
    target?: string;
    context?: TContext;
}
export interface ExecuteCustomOptions {
    timeout?: number;
    signal?: AbortSignal;
}
export declare class CustomExecutionError extends Error {
    constructor(name: string, message: string);
}
export declare function exposeCustomExecution<TContext = undefined>(client: ProcmClient, options?: ExposeCustomExecutionOptions<TContext>): () => void;
export declare function executeCustom<TResult = JsonValue, TContext = unknown>(client: ProcmClient, target: string, execute: CustomExecutionFunction<TContext, TResult>, args?: JsonValue[], options?: ExecuteCustomOptions): Promise<TResult>;
//# sourceMappingURL=custom-execution.d.ts.map