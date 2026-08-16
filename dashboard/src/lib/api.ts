import type {
  LogEntry,
  LogFileSummary,
  LogsResponse,
  ProcessListResponse,
  ProcessStream,
  ProcessView,
  StartProcessBody,
  SystemProcess,
  SystemProcessListResponse,
} from "./types";
import { decodeStructuredLogLine, stripStructuredLogFrame } from "@hunmer/procm-mcp-sdk";

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

export function setProcessFavorite(id: string, favorite: boolean): Promise<ProcessView> {
  return api<ProcessView>("PATCH", `/api/processes/${encodeURIComponent(id)}`, { favorite });
}

// Editable fields of a process record. Only the provided keys are merged
// server-side; undefined keys keep their current value. Editing a running
// process doesn't restart it — new launch fields apply on the next restart.
export interface UpdateProcessBody {
  name?: string;
  script?: string;
  args?: string[];
  cwd?: string;
  desc?: string | null;
  port?: number | null;
  envs?: Record<string, string>;
}

export function updateProcess(
  id: string,
  body: UpdateProcessBody,
): Promise<ProcessView> {
  return api<ProcessView>(
    "PATCH",
    `/api/processes/${encodeURIComponent(id)}`,
    body,
  );
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

export function clearProcessLogs(
  id: string,
): Promise<{ id: string; cleared: boolean }> {
  return api<{ id: string; cleared: boolean }>(
    "DELETE",
    `/api/processes/${encodeURIComponent(id)}/logs`,
  );
}

// Search a single stream for a regex pattern (backed by the /logs?grep= route).
// `after` requests up to that many trailing context lines following each match.
export function grepLogs(
  id: string,
  stream: ProcessStream,
  grep: string,
  ignoreCase = false,
  count = 500,
  after = 0,
): Promise<LogsResponse> {
  const qs = `stream=${stream}&grep=${encodeURIComponent(grep)}${
    ignoreCase ? "&ignoreCase=1" : ""
  }&count=${count}&after=${after}`;
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
  after = 0,
): Promise<LogEntry[]> {
  const [out, err] = await Promise.all([
    grepLogs(id, "stdout", grep, ignoreCase, count, after).catch(() => null),
    grepLogs(id, "stderr", grep, ignoreCase, count, after).catch(() => null),
  ]);
  return mergeEntries([
    ...(out ? parseLogText(out.text, "stdout") : []),
    ...(err ? parseLogText(err.text, "stderr") : []),
  ]);
}

// Absolute on-disk paths of the two plain-text log files. The browser can't
// reconstruct these (they live under os.tmpdir()), so the backend supplies
// them — used by the "copy log file location" action. Paths may be null for a
// historical record written before log paths were persisted.
export function getLogFiles(
  id: string,
): Promise<{ stdoutPath: string | null; stderrPath: string | null }> {
  return api<{ stdoutPath: string | null; stderrPath: string | null }>(
    "GET",
    `/api/processes/${encodeURIComponent(id)}/log-files`,
  );
}

// URL of the merged-log download endpoint (the browser streams the real
// on-disk .log files, merged chronologically, as an attachment). Returned as a
// plain string so the caller can set it as an <a download> href.
export function downloadLogUrl(id: string): string {
  return `/api/processes/${encodeURIComponent(id)}/log-download`;
}

// List every on-disk process log file the server has written (its processes
// dir), newest-modified first. Includes files of processes that were later
// deleted. Powers the history-log tab and the per-process log-files dialog.
export async function listLogFiles(): Promise<LogFileSummary[]> {
  const r = await api<{ files: LogFileSummary[] }>("GET", "/api/log-files");
  return r.files;
}

// Read one log file's text, capped server-side at 10MB (oversized files
// return only the trailing bytes, flagged via `truncated`). `path` is the
// LogFileSummary.path of a file previously returned by listLogFiles; the
// backend validates it stays inside its data root.
export function readLogFileContent(
  path: string,
): Promise<{ path: string; text: string; truncated: boolean }> {
  return api<{ path: string; text: string; truncated: boolean }>(
    "GET",
    `/api/log-files/content?path=${encodeURIComponent(path)}`,
  );
}

// Bulk-delete every on-disk process log file whose owning process is not
// currently running (running processes' files are still being written, so the
// backend skips them). Returns the deleted and skipped file names.
export function clearLogFiles(): Promise<{
  deleted: string[];
  skipped: string[];
}> {
  return api<{ deleted: string[]; skipped: string[] }>(
    "DELETE",
    "/api/log-files",
  );
}

// A single-line, paste-and-run terminal command reproducing how the process
// was spawned (cd to cwd + env-var prefixes + `script args`), formatted for
// the backend's own OS. Built server-side because envs live only in memory
// and are never sent to the client. Only live processes resolve; historical
// records 404.
export function getProcessCommand(
  id: string,
): Promise<{ command: string }> {
  return api<{ command: string }>(
    "GET",
    `/api/processes/${encodeURIComponent(id)}/command`,
  );
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
      const structured = decodeStructuredLogLine(m[2]);
      entries.push({
        timestamp: structured?.timestamp ?? (Number.isNaN(t) ? Date.now() : t),
        stream,
        message: structured?.message ?? stripStructuredLogFrame(m[2]),
        level: structured?.level,
        memberId: structured?.memberId,
        clientName: structured?.clientName,
        data: structured?.data,
      });
    } else {
      const structured = decodeStructuredLogLine(raw);
      entries.push({
        timestamp: structured?.timestamp ?? Date.now(),
        stream,
        message: structured?.message ?? stripStructuredLogFrame(raw),
        level: structured?.level,
        memberId: structured?.memberId,
        clientName: structured?.clientName,
        data: structured?.data,
      });
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

export function saveImportedProcess(body: StartProcessBody): Promise<{ id: string }> {
  return api<{ id: string; name: string }>("POST", "/api/processes/import", body);
}

// One launchable command to import as part of a directory-import batch.
export interface ImportBatchItem {
  script: string;
  args: string[];
  cwd: string;
  name?: string;
  desc?: string;
}

// Import a whole batch of stopped favorite records in one request. `group`
// is applied to every item. Returns the created records in input order.
export function batchImportProcesses(
  items: ImportBatchItem[],
  group: string,
): Promise<{ imported: { id: string; name: string }[] }> {
  return api<{ imported: { id: string; name: string }[] }>(
    "POST",
    "/api/processes/import-batch",
    { items, group },
  );
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

// Open the OS-native directory picker on the backend (popups-file-dialog /
// tinyfiledialogs). Resolves null when the user cancels; throws with the
// server's `error` message when the picker can't be shown.
export async function selectDirectory(): Promise<string | null> {
  const r = await api<{ canceled: boolean; path: string | null }>(
    "POST",
    "/api/select-directory",
    {},
  );
  return r.canceled ? null : r.path;
}

// Open a folder in the OS file manager. The browser can't do this directly, so
// the backend shells out (explorer/open/xdg-open). Throws with the server's
// `error` message when the path is missing or not a directory.
export function openFolder(path: string): Promise<void> {
  return api<{ ok: boolean }>("POST", "/api/open-folder", { path }).then(
    () => undefined,
  );
}

// Reveal a path in the OS file manager, selecting it if it's a file (e.g. a
// process's exe). Unlike openFolder, this handles files too — used by the
// System tab's "Open process location" action.
export function revealPath(path: string): Promise<void> {
  return api<{ ok: boolean }>("POST", "/api/reveal", { path }).then(
    () => undefined,
  );
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

// Bulk delete via the collection endpoint. Done server-side in a single
// read-modify-write pass so concurrent deletes can't race in the store and
// resurrect rows. With no ids the backend deletes every current record
// (live + historical), which is what the dashboard "clear all" wants.
export function clearAllProcesses(
  ids?: string[],
): Promise<{ deleted: string[]; notFound: string[] }> {
  return api<{ deleted: string[]; notFound: string[] }>(
    "DELETE",
    "/api/processes",
    ids ? { ids } : {},
  );
}

export function restartProcess(id: string): Promise<void> {
  return api<void>(
    "POST",
    `/api/processes/${encodeURIComponent(id)}/restart`,
  );
}

// Enumerate all running OS processes (the System tab's data source). Distinct
// from listProcesses(): that tracks procm-mcp's own spawned processes; this
// lists everything the host OS is running. Returns pid/ppid/name plus the full
// command line + exe path when the platform exposes them.
export function listSystemProcesses(): Promise<SystemProcessListResponse> {
  return api<SystemProcessListResponse>("GET", "/api/system-processes");
}

// Kill a system process and its whole descendant tree (tree-kill on the
// backend → taskkill /T /F on Windows). Protected pids (idle/system/self) are
// refused server-side and surface here as a thrown Error.
export function killSystemProcess(pid: number): Promise<void> {
  return api<{ ok: true; pid: number }>(
    "POST",
    `/api/system-processes/${pid}/kill`,
  ).then(() => undefined);
}

// Look up the process(es) listening on a TCP port (the toolbar "view port"
// feature), via find-process on the backend. Returns the owning process rows
// (possibly empty). Each row carries the queried port in its `ports` field.
export async function findProcessByPort(
  port: number,
): Promise<SystemProcess[]> {
  const r = await api<{ port: number; processes: SystemProcess[] }>(
    "GET",
    `/api/system-processes/port/${port}`,
  );
  return r.processes;
}

// Write to a running process's stdin or deliver an OS signal to it. Used by the
// log panel's input bar (text) and Ctrl+C button (SIGINT). Exactly one of
// text/signal must be set. The backend maps not_found -> 404 and other failures
// -> 400 with an explanatory `error`; the api() wrapper turns those into throws.
export type SendInputResponse = {
  id: string;
  ok: true;
  kind: "text" | "signal";
  bytes?: number;
  signal?: string;
};
export function sendProcessInput(
  id: string,
  opts: { text?: string; newline?: boolean; signal?: string },
): Promise<SendInputResponse> {
  return api<SendInputResponse>(
    "POST",
    `/api/processes/${encodeURIComponent(id)}/input`,
    opts,
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
