import { type JsonValue, type LogLevel, type RoomMessage, type StructuredLog } from "./protocol.js";
import { type ProcmClient } from "./client.js";
export interface LoggerOptions {
    client?: ProcmClient;
    clientName?: string;
    memberId?: string;
    processId?: string;
    console?: Pick<Console, "debug" | "info" | "warn" | "error">;
    /** Forward global console logging methods through this structured logger. */
    captureConsole?: boolean;
    /** Observe emitted structured entries without replacing the console sink. */
    onLog?: (entry: StructuredLog) => void;
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
/**
 * Configure the process-wide SDK logger used by integrations that do not need
 * to create and pass a Logger instance through every module.
 */
export declare function setLogger(options?: LoggerOptions): Logger;
/**
 * Application-facing logger setup. Console capture is enabled by default so
 * consumers only need to provide their identity and optional room client.
 */
export declare function setupLogger(options?: LoggerOptions): Logger;
/**
 * Zero-configuration setup for Node processes launched by procm-mcp.
 * When room variables are absent, this still enables structured console logs.
 */
export declare function setupLoggerFromEnv(options?: LoggerOptions): Logger;
/** Return the process-wide configured logger. */
export declare function getLogger(): Logger;
export declare function createLogger(options?: LoggerOptions): Logger;
export interface LogFilter {
    minLevel?: LogLevel | "silent";
    clientNames?: string[];
    memberIds?: string[];
}
export declare function matchesLogFilter(entry: StructuredLog, filter?: LogFilter): boolean;
export declare function subscribeLogs(client: ProcmClient, handler: (entry: StructuredLog, message: RoomMessage) => void, filter?: LogFilter): () => void;
//# sourceMappingURL=logger.d.ts.map