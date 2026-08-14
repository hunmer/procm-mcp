import { PROCM_LOG_TOPIC, PROCM_PROTOCOL_VERSION, encodeStructuredLog, } from "./protocol.js";
export class Logger {
    options;
    output;
    constructor(options = {}) {
        this.options = options;
        this.output = options.console ?? console;
    }
    debug(message, data, context) { this.write("debug", message, data, context); }
    info(message, data, context) { this.write("info", message, data, context); }
    warn(message, data, context) { this.write("warn", message, data, context); }
    error(message, data, context) { this.write("error", message, data, context); }
    log(level, message, data, context) {
        this.write(level, message, data, context);
    }
    write(level, message, data, context) {
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
            traceId: context?.traceId,
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