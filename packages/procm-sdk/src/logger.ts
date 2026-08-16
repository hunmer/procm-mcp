import {
  PROCM_LOG_TOPIC,
  PROCM_PROTOCOL_VERSION,
  encodeStructuredLog,
  type JsonValue,
  type LogLevel,
  type RoomMessage,
  type StructuredLog,
} from "./protocol.js";
import type { ProcmClient } from "./client.js";

export interface LoggerOptions {
  client?: ProcmClient;
  clientName?: string;
  memberId?: string;
  processId?: string;
  console?: Pick<Console, "debug" | "info" | "warn" | "error">;
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
    this.output = options.console ?? console;
    this.level = options.level ?? "debug";
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

// Keep the global logger inert until an integration explicitly configures it.
// This preserves the optional nature of procm integration for consumers.
let defaultLogger = new Logger({ level: "silent" });

/**
 * Configure the process-wide SDK logger used by integrations that do not need
 * to create and pass a Logger instance through every module.
 */
export function setLogger(options: LoggerOptions = {}): Logger {
  defaultLogger = new Logger(options);
  return defaultLogger;
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
