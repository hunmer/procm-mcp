import type {
  LogEntry,
  LogsResponse,
  ProcessListResponse,
  ProcessStream,
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

// Search a single stream for a regex pattern (backed by the /logs?grep= route).
export function grepLogs(
  id: string,
  stream: ProcessStream,
  grep: string,
  ignoreCase = false,
  count = 500,
): Promise<LogsResponse> {
  const qs = `stream=${stream}&grep=${encodeURIComponent(grep)}${
    ignoreCase ? "&ignoreCase=1" : ""
  }&count=${count}`;
  return api<LogsResponse>(
    "GET",
    `/api/processes/${encodeURIComponent(id)}/logs?${qs}`,
  );
}

// Fetch both streams' recent history in parallel and merge them into a single
// chronologically ordered list of structured log lines.
export async function getMergedLogs(
  id: string,
  count = 200,
): Promise<LogEntry[]> {
  const [out, err] = await Promise.all([
    getLogs(id, "stdout", count),
    getLogs(id, "stderr", count),
  ]);
  return mergeEntries([
    ...parseLogText(out.text, "stdout"),
    ...parseLogText(err.text, "stderr"),
  ]);
}

// Grep both streams in parallel and merge the results.
export async function grepMergedLogs(
  id: string,
  grep: string,
  ignoreCase = false,
  count = 500,
): Promise<LogEntry[]> {
  const [out, err] = await Promise.all([
    grepLogs(id, "stdout", grep, ignoreCase, count).catch(() => null),
    grepLogs(id, "stderr", grep, ignoreCase, count).catch(() => null),
  ]);
  return mergeEntries([
    ...(out ? parseLogText(out.text, "stdout") : []),
    ...(err ? parseLogText(err.text, "stderr") : []),
  ]);
}

// Absolute on-disk paths of the two plain-text log files. The browser can't
// reconstruct these (they live under os.tmpdir()), so the backend supplies
// them — used by the "copy log file location" action.
export function getLogFiles(
  id: string,
): Promise<{ stdoutPath: string; stderrPath: string }> {
  return api<{ stdoutPath: string; stderrPath: string }>(
    "GET",
    `/api/processes/${encodeURIComponent(id)}/log-files`,
  );
}

// URL of the merged-log download endpoint (the browser streams the real
// on-disk .log files, merged chronologically, as an attachment). Returned as
// a plain string so the caller can set it as an <a download> href.
export function downloadLogUrl(id: string): string {
  return `/api/processes/${encodeURIComponent(id)}/log-download`;
}

// Parse the backend's `[ISO timestamp] message\n` text blob into structured
// entries. Lines without a leading bracketed timestamp fall back to "now".
export function parseLogText(text: string, stream: ProcessStream): LogEntry[] {
  if (!text || text === "(empty)") return [];
  const entries: LogEntry[] = [];
  for (const raw of text.split("\n")) {
    if (!raw) continue;
    const m = raw.match(/^\[(.+?)\]\s?(.*)$/);
    if (m) {
      const t = Date.parse(m[1]);
      entries.push({
        timestamp: Number.isNaN(t) ? Date.now() : t,
        stream,
        message: m[2],
      });
    } else {
      entries.push({ timestamp: Date.now(), stream, message: raw });
    }
  }
  return entries;
}

// Merge one or more arrays of log entries into a single oldest-first list.
// Stable sort preserves the within-stream order for equal timestamps.
export function mergeEntries(
  ...arrays: LogEntry[][]
): LogEntry[] {
  return arrays.flat().sort((a, b) => a.timestamp - b.timestamp);
}

export function startProcess(body: StartProcessBody): Promise<{ id: string }> {
  return api<{ id: string; name: string }>("POST", "/api/processes", body);
}

// A launchable command the backend derived from a folder's project manifests
// (package.json / pyproject.toml / Cargo.toml). Shape mirrors Favorite's
// launch fields so it can be imported straight into the favorites store.
export interface ScanCandidate {
  script: string;
  args: string[];
  cwd: string;
  name?: string;
  desc?: string;
}

// Scan a folder for project commands. Returns the candidate list (possibly
// empty). Throws with the server's `error` message on a bad path.
export async function scanDirectory(
  path: string,
): Promise<ScanCandidate[]> {
  const r = await api<{ candidates: ScanCandidate[] }>(
    "POST",
    "/api/favorites/scan",
    { path },
  );
  return r.candidates;
}

export function stopProcess(id: string): Promise<void> {
  return api<void>(
    "POST",
    `/api/processes/${encodeURIComponent(id)}/stop`,
  );
}

// Delete a process entirely: stops it if still running, then erases its
// persisted record so it no longer shows up in the (historical) list.
export function deleteProcessCall(id: string): Promise<void> {
  return api<void>(
    "DELETE",
    `/api/processes/${encodeURIComponent(id)}`,
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

// Inverse of parseEnvs: render an env object back into the KEY=VALUE-per-line
// textarea format. Keys are sorted for a stable, diffable representation.
export function stringifyEnvs(envs?: Record<string, string>): string {
  if (!envs) return "";
  return Object.keys(envs)
    .sort()
    .map((k) => `${k}=${envs[k]}`)
    .join("\n");
}
