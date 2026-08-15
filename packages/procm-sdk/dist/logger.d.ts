import { type JsonValue, type LogLevel, type RoomMessage, type StructuredLog } from "./protocol.js";
import type { ProcmClient } from "./client.js";
export interface LoggerOptions {
    client?: ProcmClient;
    clientName?: string;
    memberId?: string;
    processId?: string;
    console?: Pick<Console, "debug" | "info" | "warn" | "error">;
    level?: LogLevel | "silent";
}
export interface LogContext {
    traceId?: string;
}
export declare class Logger {
    private readonly options;
    private readonly output;
    private level;
    constructor(options?: LoggerOptions);
    setLevel(level: LogLevel | "silent"): void;
    getLevel(): LogLevel | "silent";
    debug(message: string, data?: JsonValue, context?: LogContext): void;
    info(message: string, data?: JsonValue, context?: LogContext): void;
    warn(message: string, data?: JsonValue, context?: LogContext): void;
    error(message: string, data?: JsonValue, context?: LogContext): void;
    log(level: LogLevel, message: string, data?: JsonValue, context?: LogContext): void;
    private write;
}
export declare function createLogger(options?: LoggerOptions): Logger;
export interface LogFilter {
    minLevel?: LogLevel | "silent";
    clientNames?: string[];
    memberIds?: string[];
}
export declare function matchesLogFilter(entry: StructuredLog, filter?: LogFilter): boolean;
export declare function subscribeLogs(client: ProcmClient, handler: (entry: StructuredLog, message: RoomMessage) => void, filter?: LogFilter): () => void;
//# sourceMappingURL=logger.d.ts.map