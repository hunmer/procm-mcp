export declare const PROCM_PROTOCOL_VERSION: 1;
export declare const PROCM_LOG_TOPIC = "$procm/log";
export declare const PROCM_LOG_MARKER = "@@PROCM_LOG_V1@@";
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
export type LogLevel = "debug" | "info" | "warn" | "error";
export interface RoomMember {
    memberId: string;
    connectionId: string;
    clientName: string;
    processId?: string;
    connectedAt: number;
    metadata?: Record<string, JsonValue>;
}
export interface RoomMessage<T = JsonValue> {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "message";
    roomId: string;
    messageId: string;
    memberId: string;
    topic: string;
    timestamp: number;
    payload: T;
    retain?: boolean;
    correlationId?: string;
}
export interface StructuredLog {
    version: typeof PROCM_PROTOCOL_VERSION;
    timestamp: number;
    level: LogLevel;
    memberId: string;
    clientName: string;
    processId?: string;
    message: string;
    data?: JsonValue;
    traceId?: string;
}
export type ClientFrame = {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "hello";
    roomId: string;
    memberId: string;
    clientName: string;
    processId?: string;
    metadata?: Record<string, JsonValue>;
} | {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "subscribe";
    subscriptionId: string;
    topic: string;
    prefix?: boolean;
} | {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "unsubscribe";
    subscriptionId: string;
} | {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "publish";
    messageId: string;
    topic: string;
    timestamp: number;
    payload: JsonValue;
    retain?: boolean;
    correlationId?: string;
} | {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "trace:put";
    requestId: string;
    traceId: string;
    ttlSeconds?: number;
    payload: JsonValue;
} | {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "ping";
    timestamp: number;
};
export type ServerFrame = {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "welcome";
    roomId: string;
    member: RoomMember;
    members: RoomMember[];
} | RoomMessage | {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "member";
    roomId: string;
    event: "joined" | "left" | "replaced";
    member: RoomMember;
} | {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "error";
    code: string;
    message: string;
    requestId?: string;
} | {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "trace:stored";
    requestId: string;
    traceId: string;
} | {
    version: typeof PROCM_PROTOCOL_VERSION;
    type: "pong";
    timestamp: number;
};
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function parseClientFrame(value: unknown): ClientFrame | null;
export declare function parseServerFrame(value: unknown): ServerFrame | null;
export declare function matchesTopic(topic: string, filter: string, prefix?: boolean): boolean;
export declare function encodeStructuredLog(log: StructuredLog): string;
export declare function decodeStructuredLogLine(line: string): StructuredLog | null;
export declare function stripStructuredLogFrame(line: string): string;
//# sourceMappingURL=protocol.d.ts.map