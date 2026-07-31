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

export interface StartProcessBody {
  name?: string;
  script: string;
  args?: string[];
  cwd: string;
  envs?: Record<string, string>;
}

// ---- WebSocket messages (mirrors src/websocket-server.ts envelope) ----

export type ProcessStream = "stdout" | "stderr";

// Server -> client: full process list snapshot or live update.
export interface WsProcessesMessage {
  type: "processes";
  serverId?: string;
  pid?: number;
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
