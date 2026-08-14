import { type JsonValue, type LogLevel } from "./protocol.js";
import type { ProcmClient } from "./client.js";
export interface LoggerOptions {
    client?: ProcmClient;
    clientName?: string;
    memberId?: string;
    processId?: string;
    console?: Pick<Console, "debug" | "info" | "warn" | "error">;
}
export declare class Logger {
    private readonly options;
    private readonly output;
    constructor(options?: LoggerOptions);
    debug(message: string, data?: JsonValue): void;
    info(message: string, data?: JsonValue): void;
    warn(message: string, data?: JsonValue): void;
    error(message: string, data?: JsonValue): void;
    log(level: LogLevel, message: string, data?: JsonValue): void;
    private write;
}
export declare function createLogger(options?: LoggerOptions): Logger;
//# sourceMappingURL=logger.d.ts.map