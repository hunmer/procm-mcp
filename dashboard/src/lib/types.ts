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
