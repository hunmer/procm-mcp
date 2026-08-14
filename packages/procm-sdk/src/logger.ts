import {
  PROCM_LOG_TOPIC,
  PROCM_PROTOCOL_VERSION,
  encodeStructuredLog,
  type JsonValue,
  type LogLevel,
  type StructuredLog,
} from "./protocol.js";
import type { ProcmClient } from "./client.js";

export interface LoggerOptions {
  client?: ProcmClient;
  clientName?: string;
  memberId?: string;
  processId?: string;
  console?: Pick<Console, "debug" | "info" | "warn" | "error">;
}

export class Logger {
  private readonly output: Pick<Console, "debug" | "info" | "warn" | "error">;

  constructor(private readonly options: LoggerOptions = {}) {
    this.output = options.console ?? console;
  }

  debug(message: string, data?: JsonValue): void { this.write("debug", message, data); }
  info(message: string, data?: JsonValue): void { this.write("info", message, data); }
  warn(message: string, data?: JsonValue): void { this.write("warn", message, data); }
  error(message: string, data?: JsonValue): void { this.write("error", message, data); }

  log(level: LogLevel, message: string, data?: JsonValue): void {
    this.write(level, message, data);
  }

  private write(level: LogLevel, message: string, data?: JsonValue): void {
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

export function createLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}
