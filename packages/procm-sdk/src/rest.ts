import type { ProcmClient } from "./client.js";

function httpBase(client: ProcmClient): { base: string; token?: string } {
  const target = client.connectionTarget;
  if (!target.url) throw new Error("procm HTTP URL is required");
  return {
    base: target.url.replace(/^ws(s?):\/\//, "http$1://").replace(/\/room\/?$/, ""),
    token: target.token,
  };
}

async function request<T>(client: ProcmClient, method: string, path: string, body?: unknown): Promise<T> {
  const { base, token } = httpBase(client);
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload as T;
}

export interface ImportProcessItem {
  script: string;
  args: string[];
  cwd: string;
  name?: string;
  desc?: string;
}

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
  desc?: string | null;
  group?: string | null;
  port?: number | null;
  roomId?: string | null;
  startedAt?: number;
  lastStartedAt?: number | null;
  stoppedAt?: number | null;
  favorite?: boolean;
}

export interface ProcessListResponse {
  serverId: string;
  pid: number;
  startedAt?: number;
  port?: number | null;
  processes: ProcessView[];
}

export interface UpdateProcessBody {
  name?: string;
  script?: string;
  args?: string[];
  cwd?: string;
  desc?: string | null;
  port?: number | null;
  envs?: Record<string, string>;
  group?: string | null;
}

export interface ServerLogFile {
  name: string;
  path: string;
  size: number;
  modifiedAt: number;
}

export interface ServerLogInfo {
  dir: string;
  maxBytes: number;
  defaultMaxBytes: number;
  envMaxBytes: number | null;
  files: ServerLogFile[];
}

export function listProcesses(client: ProcmClient): Promise<ProcessListResponse> {
  return request(client, "GET", "/api/processes");
}

export function getProcess(client: ProcmClient, id: string): Promise<ProcessView> {
  return request(client, "GET", `/api/processes/${encodeURIComponent(id)}`);
}

export function updateProcess(
  client: ProcmClient,
  id: string,
  updates: UpdateProcessBody,
): Promise<ProcessView> {
  return request(client, "PATCH", `/api/processes/${encodeURIComponent(id)}`, updates);
}

export function getServerLogInfo(client: ProcmClient): Promise<ServerLogInfo> {
  return request(client, "GET", "/api/server-log");
}

export function updateServerLogMaxBytes(
  client: ProcmClient,
  maxBytes: number | null,
): Promise<ServerLogInfo> {
  return request(client, "PUT", "/api/server-log/settings", { maxBytes });
}

export function clearServerLogs(client: ProcmClient): Promise<{ cleared: string[] }> {
  return request(client, "DELETE", "/api/server-log");
}

export function clearProcessLogs(client: ProcmClient, id: string): Promise<{ id: string; cleared: true }> {
  return request(client, "DELETE", `/api/processes/${encodeURIComponent(id)}/logs`);
}

export function killSystemProcess(client: ProcmClient, pid: number, tree = true): Promise<void> {
  return request<{ ok: true; pid: number }>(
    client,
    "POST",
    `/api/system-processes/${pid}/kill${tree ? "" : "?tree=0"}`,
  ).then(() => undefined);
}

/** Clear logs for the process represented by the client. */
export function clearLogs(
  client: ProcmClient,
  id: string | undefined = client.processId,
): Promise<{ id: string; cleared: true }> {
  if (!id) throw new Error("process id is required to clear logs");
  return clearProcessLogs(client, id);
}

export function importProcessBatch(client: ProcmClient, items: ImportProcessItem[], group?: string): Promise<{ imported: { id: string; name: string; favorite: boolean }[] }> {
  if (!items.length) throw new Error("items must be a non-empty array");
  return request(client, "POST", "/api/processes/import-batch", { items, ...(group === undefined ? {} : { group }) });
}

export const batchImportProcesses = importProcessBatch;

export async function selectDirectory(client: ProcmClient, title?: string): Promise<string | null> {
  const result = await request<{ canceled: boolean; path: string | null }>(client, "POST", "/api/select-directory", title === undefined ? {} : { title });
  return result.canceled ? null : result.path;
}
