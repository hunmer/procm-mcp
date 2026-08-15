import { PROCM_LOG_TOPIC, PROCM_PROTOCOL_VERSION, encodeStructuredLog, } from "./protocol.js";
const LEVEL_ORDER = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 4,
};
export class Logger {
    options;
    output;
    level;
    constructor(options = {}) {
        this.options = options;
        this.output = options.console ?? console;
        this.level = options.level ?? "debug";
    }
    setLevel(level) {
        this.level = level;
    }
    getLevel() {
        return this.level;
    }
    debug(message, data, context) { this.write("debug", message, data, context); }
    info(message, data, context) { this.write("info", message, data, context); }
    warn(message, data, context) { this.write("warn", message, data, context); }
    error(message, data, context) { this.write("error", message, data, context); }
    log(level, message, data, context) {
        this.write(level, message, data, context);
    }
    write(level, message, data, context) {
        if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level])
            return;
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
export function matchesLogFilter(entry, filter = {}) {
    if (filter.minLevel !== undefined && LEVEL_ORDER[entry.level] < LEVEL_ORDER[filter.minLevel])
        return false;
    if (filter.clientNames?.length && !filter.clientNames.includes(entry.clientName))
        return false;
    if (filter.memberIds?.length && !filter.memberIds.includes(entry.memberId))
        return false;
    return true;
}
// Subscribe to the room's structured-log topic, forwarding only entries that
// pass the filter (and skipping payloads that are not structured logs).
// Returns the unsubscribe function.
export function subscribeLogs(client, handler, filter = {}) {
    return client.subscribe(PROCM_LOG_TOPIC, (message) => {
        const entry = message.payload;
        if (!entry || typeof entry !== "object" || typeof entry.level !== "string" || typeof entry.message !== "string")
            return;
        if (!matchesLogFilter(entry, filter))
            return;
        handler(entry, message);
    });
}
//# sourceMappingURL=logger.js.map