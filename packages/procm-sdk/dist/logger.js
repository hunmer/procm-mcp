import { PROCM_LOG_TOPIC, PROCM_PROTOCOL_VERSION, encodeStructuredLog, } from "./protocol.js";
export class Logger {
    options;
    output;
    constructor(options = {}) {
        this.options = options;
        this.output = options.console ?? console;
    }
    debug(message, data) { this.write("debug", message, data); }
    info(message, data) { this.write("info", message, data); }
    warn(message, data) { this.write("warn", message, data); }
    error(message, data) { this.write("error", message, data); }
    log(level, message, data) {
        this.write(level, message, data);
    }
    write(level, message, data) {
        const client = this.options.client;
        const entry = {
            version: PROCM_PROTOCOL_VERSION,
            timestamp: Date.now(),
            level,
            memberId: this.options.memberId ?? client?.memberId ?? "standalone",
            clientName: this.options.clientName ?? client?.clientName ?? "app",
            processId: this.options.processId ?? client?.processId,
            message,
            data,
        };
        const readable = `${entry.timestamp ? new Date(entry.timestamp).toISOString() : ""} ${level.toUpperCase()} ${entry.clientName}: ${message}${data === undefined ? "" : ` ${JSON.stringify(data)}`}`;
        this.output[level](`${readable} ${encodeStructuredLog(entry)}`);
        if (client?.connectionState === "open") {
            try {
                client.publish(PROCM_LOG_TOPIC, entry);
            }
            catch {
                // Console output remains the reliable fallback.
            }
        }
    }
}
export function createLogger(options = {}) {
    return new Logger(options);
}
//# sourceMappingURL=logger.js.map