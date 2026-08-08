// Mirrors the backend `toPublicView` shape (see src/http-server.ts).

export type ProcessStatus = "spawning" | "running" | "exited" | "error";

export interface ProcessView {
  id: string;
  name: string;
  script: string;
  args: string[];
  cwd: string;
  status: ProcessStatus;
  pid: number | null;
  exitCode: number | null;
  error: string | null;
  // Optional human-readable description, shown in the process list.
  desc?: string | null;
  // Lifecycle timestamps (epoch ms). addedAt stays undefined for live-only
  // records the server didn't persist, so the UI tolerates their absence.
  startedAt?: number;
  // Epoch ms of the most recent start; reset on every restart. Used to show
  // "time since last restart". Falls back to startedAt when absent.
  lastStartedAt?: number | null;
  stoppedAt?: number | null;
}

export interface ProcessListResponse {
  serverId: string;
  pid: number;
  processes: ProcessView[];
}

export interface LogsResponse {
  stream: "stdout" | "stderr";
  text: string;
}

// A single structured log line, with its source stream. stdout and stderr are
// merged into one chronologically ordered list in the UI.
export interface LogEntry {
  timestamp: number; // epoch ms
  stream: ProcessStream;
  message: string;
}

export interface StartProcessBody {
  name?: string;
  script: string;
  args?: string[];
  cwd: string;
  envs?: Record<string, string>;
  desc?: string;
}

// ---- WebSocket messages (mirrors src/websocket-server.ts envelope) ----

export type ProcessStream = "stdout" | "stderr";

// Server -> client: full process list snapshot or live update.
export interface WsProcessesMessage {
  type: "processes";
  serverId?: string;
  pid?: number;
  // Wall-clock ms when the backend started; used to compute uptime.
  startedAt?: number;
  data: ProcessView[];
  snapshot?: boolean;
}

// Server -> client: a single new log line for a process/stream.
export interface WsLogMessage {
  type: "log";
  processId: string;
  stream: ProcessStream;
  timestamp: number;
  message: string;
}

export type WsServerMessage = WsProcessesMessage | WsLogMessage;
