import { PROCM_LOG_TOPIC, PROCM_PROTOCOL_VERSION, encodeStructuredLog, } from "./protocol.js";
import { createProcmClient } from "./client.js";
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
        const nativeConsole = {
            debug: console.debug.bind(console),
            info: console.info.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
        };
        this.output = options.console ?? nativeConsole;
        this.level = options.level ?? "debug";
        if (options.captureConsole)
            installConsoleCapture(this);
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
        try {
            this.options.onLog?.(entry);
        }
        catch {
            // Observers must not interfere with the original logger output.
        }
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
let restoreConsole;
function installConsoleCapture(logger) {
    restoreConsole?.();
    const originals = {
        debug: console.debug.bind(console),
        info: console.info.bind(console),
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        trace: console.trace.bind(console),
    };
    console.debug = (...args) => logger.debug(formatConsoleArgs(args));
    console.info = (...args) => logger.info(formatConsoleArgs(args));
    console.log = (...args) => logger.info(formatConsoleArgs(args));
    console.warn = (...args) => logger.warn(formatConsoleArgs(args));
    console.error = (...args) => logger.error(formatConsoleArgs(args));
    console.trace = (...args) => logger.debug(formatConsoleArgs(args));
    restoreConsole = () => {
        console.debug = originals.debug;
        console.info = originals.info;
        console.log = originals.log;
        console.warn = originals.warn;
        console.error = originals.error;
        console.trace = originals.trace;
        restoreConsole = undefined;
    };
}
function formatConsoleArgs(args) {
    return args.map((arg) => {
        if (arg instanceof Error)
            return arg.stack || `${arg.name}: ${arg.message}`;
        if (typeof arg === "object" && arg !== null) {
            try {
                return JSON.stringify(arg);
            }
            catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(" ");
}
// Keep the global logger inert until an integration explicitly configures it.
// This preserves the optional nature of procm integration for consumers.
let defaultLogger = new Logger({ level: "silent" });
/**
 * Configure the process-wide SDK logger used by integrations that do not need
 * to create and pass a Logger instance through every module.
 */
export function setLogger(options = {}) {
    restoreConsole?.();
    defaultLogger = new Logger(options);
    return defaultLogger;
}
/**
 * Application-facing logger setup. Console capture is enabled by default so
 * consumers only need to provide their identity and optional room client.
 */
export function setupLogger(options = {}) {
    return setLogger({ ...options, captureConsole: options.captureConsole ?? true });
}
/**
 * Zero-configuration setup for Node processes launched by procm-mcp.
 * When room variables are absent, this still enables structured console logs.
 */
export function setupLoggerFromEnv(options = {}) {
    const processLike = globalThis.process;
    const env = processLike?.env ?? {};
    const clientName = options.clientName ?? env.PROCM_CLIENT_NAME;
    let client = options.client;
    if (!client && env.PROCM_ROOM_ID && env.PROCM_WS_URL) {
        try {
            client = createProcmClient({ clientName });
        }
        catch {
            // Console logging remains available when room setup is incomplete.
        }
    }
    return setupLogger({ ...options, client, clientName });
}
/** Return the process-wide configured logger. */
export function getLogger() {
    return defaultLogger;
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