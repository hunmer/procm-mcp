import { EventEmitter } from "events";

// A lightweight in-process event bus that decouples data producers
// (process-manager, process-stdout-client) from consumers (the WebSocket
// broadcaster). Node's built-in EventEmitter is enough — no extra deps.

export const PROCESS_CHANGE = "processChange";
export const LOG_APPEND = "logAppend";
export const LOG_CLEAR = "logClear";

export type LogStream = "stdout" | "stderr";

export interface LogAppendPayload {
  processId: string;
  stream: LogStream;
  timestamp: number;
  message: string;
  level?: "debug" | "info" | "warn" | "error";
  memberId?: string;
  clientName?: string;
  data?: unknown;
}

class DashboardEventBus extends EventEmitter {
  // Process-state changes can fire in tight bursts (e.g. spawning -> running
  // within milliseconds). Coalesce them so subscribers broadcast at most once
  // per tick while still reflecting the final, accurate state.
  private changePending = false;

  emitProcessChange(): void {
    if (this.changePending) return;
    this.changePending = true;
    // Schedule on the next microtask-ish boundary. Using queueMicrotask keeps
    // it within the same event loop turn so the UI feels instant, while
    // collapsing any synchronous burst of changes into one notification.
    queueMicrotask(() => {
      this.changePending = false;
      this.emit(PROCESS_CHANGE);
    });
  }

  emitLog(payload: LogAppendPayload): void {
    this.emit(LOG_APPEND, payload);
  }

  emitLogClear(processId: string): void {
    this.emit(LOG_CLEAR, { processId });
  }
}

export const dashboardEvents = new DashboardEventBus();
