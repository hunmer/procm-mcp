import type {
  LogsResponse,
  ProcessListResponse,
  ProcessView,
  StartProcessBody,
} from "./types";

// Thin wrapper around the same-origin REST API. Throws on non-2xx with the
// server's `error` message when present.

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const opts: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    (opts.headers as Record<string, string>)["Content-Type"] =
      "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in (data as object)
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function listProcesses(): Promise<ProcessListResponse> {
  return api<ProcessListResponse>("GET", "/api/processes");
}

export function getProcess(id: string): Promise<ProcessView> {
  return api<ProcessView>("GET", `/api/processes/${encodeURIComponent(id)}`);
}

export function getLogs(
  id: string,
  stream: "stdout" | "stderr",
  count = 200,
): Promise<LogsResponse> {
  const qs = `stream=${stream}&count=${count}`;
  return api<LogsResponse>(
    "GET",
    `/api/processes/${encodeURIComponent(id)}/logs?${qs}`,
  );
}

export function startProcess(body: StartProcessBody): Promise<{ id: string }> {
  return api<{ id: string; name: string }>("POST", "/api/processes", body);
}

export function stopProcess(id: string): Promise<void> {
  return api<void>(
    "POST",
    `/api/processes/${encodeURIComponent(id)}/stop`,
  );
}

export function restartProcess(id: string): Promise<void> {
  return api<void>(
    "POST",
    `/api/processes/${encodeURIComponent(id)}/restart`,
  );
}

// Parse a `KEY=VALUE`-per-line textarea into an env object.
export function parseEnvs(text: string): Record<string, string> {
  const envs: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    envs[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return envs;
}
