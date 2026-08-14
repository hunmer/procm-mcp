import type { ProcmClient } from "./client.js";
import type { JsonValue } from "./protocol.js";
export declare const TRACE_MAX_BYTES = 262144;
export declare const TRACE_MIN_TTL_SECONDS = 1;
export declare const TRACE_MAX_TTL_SECONDS = 604800;
export interface SaveTraceOptions {
    id?: string;
    ttlSeconds?: number;
    timeout?: number;
    signal?: AbortSignal;
}
export interface TraceEnvelope<T extends JsonValue = JsonValue> {
    version: 1;
    traceId: string;
    createdAt: number;
    roomId: string;
    memberId: string;
    processId?: string;
    data: T;
}
export declare function saveTrace<T extends JsonValue>(client: ProcmClient, data: T, options?: SaveTraceOptions): Promise<string>;
//# sourceMappingURL=trace.d.ts.map