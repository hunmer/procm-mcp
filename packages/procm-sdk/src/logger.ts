import {
  PROCM_LOG_TOPIC,
  PROCM_PROTOCOL_VERSION,
  encodeStructuredLog,
  type JsonValue,
  type LogLevel,
  type RoomMessage,
  type StructuredLog,
} from "./protocol.js";
import { createProcmClient, type ProcmClient } from "./client.js";

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
  // Minimum level to emit; entries below it are dropped before reaching the
  // console or the room. "silent" suppresses everything. Defaults to "debug".
  level?: LogLevel | "silent";
}

export interface LogContext {
  traceId?: string;
}

const LEVEL_ORDER: Record<LogLevel | "silent", number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export class Logger {
  private readonly output: Pick<Console, "debug" | "info" | "warn" | "error">;
  private level: LogLevel | "silent";

  constructor(private readonly options: LoggerOptions = {}) {
    const nativeConsole = {
      debug: console.debug.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };
    this.output = options.console ?? nativeConsole;
    this.level = options.level ?? "debug";
    if (options.captureConsole) installConsoleCapture(this);
  }

  setLevel(level: LogLevel | "silent"): void {
    this.level = level;
  }

  getLevel(): LogLevel | "silent" {
    return this.level;
  }

  debug(message: string, data?: JsonValue, context?: LogContext): void { this.write("debug", message, data, context); }
  info(message: string, data?: JsonValue, context?: LogContext): void { this.write("info", message, data, context); }
  warn(message: string, data?: JsonValue, context?: LogContext): void { this.write("warn", message, data, context); }
  error(message: string, data?: JsonValue, context?: LogContext): void { this.write("error", message, data, context); }

  log(level: LogLevel, message: string, data?: JsonValue, context?: LogContext): void {
    this.write(level, message, data, context);
  }

  private write(level: LogLevel, message: string, data?: JsonValue, context?: LogContext): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const client = this.options.client;
    const entry: StructuredLog = {
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
    } catch {
      // Observers must not interfere with the original logger output.
    }
    const readable = `${entry.timestamp ? new Date(entry.timestamp).toISOString() : ""} ${level.toUpperCase()} ${entry.clientName}: ${message}${data === undefined ? "" : ` ${JSON.stringify(data)}`}`;
    this.output[level](`${readable} ${encodeStructuredLog(entry)}`);
    if (client?.connectionState === "open") {
      try {
        client.publish(PROCM_LOG_TOPIC, entry as unknown as JsonValue);
      } catch {
        // Console output remains the reliable fallback.
      }
    }
  }
}

let restoreConsole: (() => void) | undefined;

function installConsoleCapture(logger: Logger): void {
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

function formatConsoleArgs(args: unknown[]): string {
  return args.map((arg) => {
    if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
    if (typeof arg === "object" && arg !== null) {
      try { return JSON.stringify(arg); } catch { return String(arg); }
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
export function setLogger(options: LoggerOptions = {}): Logger {
  restoreConsole?.();
  defaultLogger = new Logger(options);
  return defaultLogger;
}

/**
 * Application-facing logger setup. Console capture is enabled by default so
 * consumers only need to provide their identity and optional room client.
 */
export function setupLogger(options: LoggerOptions = {}): Logger {
  return setLogger({ ...options, captureConsole: options.captureConsole ?? true });
}

/**
 * Zero-configuration setup for Node processes launched by procm-mcp.
 * When room variables are absent, this still enables structured console logs.
 */
export function setupLoggerFromEnv(options: LoggerOptions = {}): Logger {
  const processLike = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  const env = processLike?.env ?? {};
  const clientName = options.clientName ?? env.PROCM_CLIENT_NAME;
  let client = options.client;
  if (!client && env.PROCM_ROOM_ID && env.PROCM_WS_URL) {
    try {
      client = createProcmClient({ clientName });
    } catch {
      // Console logging remains available when room setup is incomplete.
    }
  }
  return setupLogger({ ...options, client, clientName });
}

/** Return the process-wide configured logger. */
export function getLogger(): Logger {
  return defaultLogger;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}

// Consumer-side filter for room log streams: entries below minLevel or from
// unlisted sources are dropped before reaching the handler. An empty/omitted
// clientNames/memberIds list means "no restriction".
export interface LogFilter {
  minLevel?: LogLevel | "silent";
  clientNames?: string[];
  memberIds?: string[];
}

export function matchesLogFilter(entry: StructuredLog, filter: LogFilter = {}): boolean {
  if (filter.minLevel !== undefined && LEVEL_ORDER[entry.level] < LEVEL_ORDER[filter.minLevel]) return false;
  if (filter.clientNames?.length && !filter.clientNames.includes(entry.clientName)) return false;
  if (filter.memberIds?.length && !filter.memberIds.includes(entry.memberId)) return false;
  return true;
}

// Subscribe to the room's structured-log topic, forwarding only entries that
// pass the filter (and skipping payloads that are not structured logs).
// Returns the unsubscribe function.
export function subscribeLogs(
  client: ProcmClient,
  handler: (entry: StructuredLog, message: RoomMessage) => void,
  filter: LogFilter = {},
): () => void {
  return client.subscribe(PROCM_LOG_TOPIC, (message) => {
    const entry = message.payload as unknown as StructuredLog | null;
    if (!entry || typeof entry !== "object" || typeof entry.level !== "string" || typeof entry.message !== "string") return;
    if (!matchesLogFilter(entry, filter)) return;
    handler(entry, message);
  });
}
