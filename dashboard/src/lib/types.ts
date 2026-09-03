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
  group?: string | null;
  // Optional port the process serves on; the card shows a one-click open link
  // to http://localhost:<port> when set. null/undefined when absent.
  port?: number | null;
  roomId?: string | null;
  // Lifecycle timestamps (epoch ms). addedAt stays undefined for live-only
  // records the server didn't persist, so the UI tolerates their absence.
  startedAt?: number;
  // Epoch ms of the most recent start; reset on every restart. Used to show
  // "time since last restart". Falls back to startedAt when absent.
  lastStartedAt?: number | null;
  stoppedAt?: number | null;
  favorite?: boolean;
  // Operator env vars. ONLY present on the GET /api/processes/:id detail
  // response (used by the clone flow); list/WS payloads omit it.
  envs?: Record<string, string> | null;
}

export interface ProcessListResponse {
  serverId: string;
  pid: number;
  startedAt?: number;
  // Port the backend HTTP server listens on. Null when the backend hasn't
  // started one; absent on backends older than this field.
  port?: number | null;
  processes: ProcessView[];
}

export interface RoomMember {
  memberId: string;
  connectionId: string;
  clientName: string;
  processId?: string;
  connectedAt: number;
  metadata?: Record<string, unknown>;
}

export interface RoomView {
  id: string;
  title: string;
  note: string;
  processIds: string[];
  createdAt: number;
  updatedAt: number;
  members: RoomMember[];
}

export interface RoomLogEntry {
  timestamp: number;
  roomId: string;
  processId: string;
  stream: ProcessStream;
  message: string;
  level?: "debug" | "info" | "warn" | "error";
  memberId?: string;
  clientName?: string;
  data?: unknown;
  traceId?: string;
}

// A single OS-level process row from /api/system-processes. Unlike ProcessView
// (which tracks procm-mcp's own spawned processes), these are all host-OS
// processes (common OS system processes are already filtered out server-side).
// `cmd` is the full command line (exe path + args) and `exe` the executable
// path (best-effort on non-Windows); either may be null when the OS/scope
// doesn't expose one. `name` is the executable's short name (final path
// segment — macOS reports full app paths otherwise). `ports` lists TCP ports
// the process is listening on (undefined when none).
export interface SystemProcess {
  pid: number;
  ppid: number;
  name: string;
  cmd: string | null;
  exe: string | null;
  ports?: number[];
}

export interface SystemProcessListResponse {
  processes: SystemProcess[];
}

export interface LogsResponse {
  stream: "stdout" | "stderr";
  text: string;
}

// One on-disk process log file from GET /api/log-files (the append-only
// `<id>-<stream>.log` files the server writes per process). Files referenced
// by persisted records from previous server generations are included too, so
// history survives backend restarts. processName/status are joined from live +
// historical records; null when only the file remains.
export interface LogFileSummary {
  name: string; // "<processId>-<stream>.log"
  path: string; // absolute on-disk path
  processId: string;
  stream: ProcessStream;
  size: number; // bytes
  modifiedAt: number; // epoch ms
  processName: string | null;
  status: ProcessStatus | null;
}

// The server's own debug.log files (one per server-generation dir in the data
// root) plus the effective size cap, from GET/PUT /api/server-log. maxBytes
// precedence: persisted setting > env PROCM_DEBUG_LOG_MAX_BYTES > 20MB default.
export interface ServerLogInfo {
  dir: string; // data root holding the per-generation log folders
  maxBytes: number;
  defaultMaxBytes: number;
  envMaxBytes: number | null;
  files: { name: string; path: string; size: number; modifiedAt: number }[];
}

// A single structured log line, with its source stream. stdout and stderr are
// merged into one chronologically ordered list in the UI.
export interface LogEntry {
  timestamp: number; // epoch ms
  stream: ProcessStream;
  message: string;
  level?: "debug" | "info" | "warn" | "error";
  memberId?: string;
  clientName?: string;
  data?: unknown;
}

export interface StartProcessBody {
  name?: string;
  script: string;
  args?: string[];
  cwd: string;
  envs?: Record<string, string>;
  desc?: string;
  port?: number;
  roomId?: string;
  group?: string;
  favorite?: boolean;
  overwrite?: boolean;
  restart?: boolean;
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
  // Port the backend HTTP server listens on. Absent on older backends.
  port?: number | null;
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
  level?: "debug" | "info" | "warn" | "error";
  memberId?: string;
  clientName?: string;
  data?: unknown;
}

export interface WsLogClearedMessage {
  type: "logCleared";
  processId: string;
}

export type WsServerMessage = WsProcessesMessage | WsLogMessage | WsLogClearedMessage;
