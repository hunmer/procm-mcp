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

export function clearProcessLogs(client: ProcmClient, id: string): Promise<{ id: string; cleared: true }> {
  return request(client, "DELETE", `/api/processes/${encodeURIComponent(id)}/logs`);
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
