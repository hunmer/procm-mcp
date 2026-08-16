import http from "http";
import path from "path";
import { readFile, open, stat, writeFile } from "fs/promises";
import { spawn, execFileSync } from "child_process";
import {
  dashboardNotBuiltHtml,
  getDashboardServeState,
  readDashboardAsset,
} from "./dashboard-html.js";
import { serverLog, serverId, serverStartedAt } from "./server-log.js";
import {
  listProcesses,
  listProcessRecords,
  getProcess,
  getProcessRecord,
  startProcess,
  removeProcess,
  deleteProcess,
  deleteProcesses,
  restartProcess,
  generateProcessId,
  validateScript,
  pushProcess,
  sendProcessInput,
  setProcessFavorite,
  updateProcessFields,
  type ProcessFieldUpdates,
  saveProcessRecord,
} from "./process-manager.js";
import type { ProcessRecord } from "./processes-repository.js";
import { toErrorMessage } from "./error.js";
import { ProcessMetadata } from "./types.js";
import { handleMcpRequest } from "./mcp-http.js";
import { attachWebsocketServer } from "./websocket-server.js";
import { setConnectionConfig } from "./connection-config.js";
import { getRoom, listRooms, patchRoom } from "./room-hub.js";
import { queryRoomLogs } from "./room-logs.js";
import { scanProjectCommands } from "./project-scanner.js";
import { createRequire } from "module";
// native-file-dialog ships only a compiled .node addon (no CJS wrapper), so
// the ESM loader can't import it — pull it through createRequire. The addon
// is Windows-only, so load it lazily and use osascript on macOS; a broken or
// missing addon must not take the whole server down at startup.
let folderDialog: (() => string) | null = null;

function pickDirectory(): string {
  if (process.platform === "darwin") {
    try {
      return execFileSync("osascript", [
        "-e",
        'POSIX path of (choose folder with prompt "Select directory")',
      ])
        .toString()
        .trim();
    } catch (e) {
      const stderr = e instanceof Error ? e.message : String(e);
      if (/-128|cancel/i.test(stderr)) return "UserCancelled";
      throw e;
    }
  }
  folderDialog ??= createRequire(import.meta.url)(
    "native-file-dialog",
  ) as unknown as { folder_dialog: () => string }["folder_dialog"];
  return folderDialog();
}
import { listSystemProcesses, killProcessTree, findProcessByPort } from "./system-processes.js";
import { ProcmMcpDir } from "./procm-mcp-dir.js";
import { listProcessLogFiles, deleteProcessLogFiles } from "./process-log-files.js";

const HOST = "127.0.0.1";

function json(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function html(res: http.ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function asset(
  res: http.ServerResponse,
  status: number,
  body: Buffer,
  contentType: string,
) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": body.length,
  });
  res.end(body);
}

// Resolve on each request. `npm link` can replace the built dashboard while a
// backend is running; caching index.html would then point browsers at asset
// hashes that no longer exist on disk.
function currentDashboardState() {
  return getDashboardServeState();
}

function toPublicView(p: ProcessMetadata) {
  return {
    id: p.id,
    name: p.name,
    script: p.script,
    args: p.args,
    cwd: p.cwd,
    status: p.status,
    pid: p.pid ?? null,
    exitCode: p.exitCode,
    error: p.error,
    desc: p.desc,
    group: p.group,
    port: p.port,
    roomId: p.roomId,
    favorite: p.favorite,
  };
}

// Public view of a (possibly historical) process record. Adds the lifecycle
// timestamps so the UI can show expired entries and sort by start time.
function toPublicRecord(p: ProcessRecord) {
  return {
    id: p.id,
    name: p.name,
    script: p.script,
    args: p.args,
    cwd: p.cwd,
    status: p.status,
    pid: p.pid,
    exitCode: p.exitCode,
    error: p.error,
    desc: p.desc,
    group: p.group ?? null,
    port: p.port ?? null,
    roomId: p.roomId ?? null,
    favorite: p.favorite ?? false,
    startedAt: p.startedAt,
    lastStartedAt: p.lastStartedAt ?? null,
    stoppedAt: p.stoppedAt,
  };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      // Guard against unbounded payloads.
      if (data.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Reveal a folder in the OS file manager. Validates the path exists and is a
// directory, then shells out to the platform's opener detached so the server
// isn't tied to the spawned process's lifetime. Rejects with a clear message
// on a missing/non-dir path or a launch failure.
function openInFileManager(dir: string): Promise<void> {
  return launchFileManager(dir, false);
}

// Reveal an arbitrary path in the OS file manager. Unlike openInFileManager
// (folders only), this also handles files and selects them in the manager:
//   - Windows: `explorer /select,"<file>"` for files, `explorer "<folder>"`
//   - macOS:   `open -R "<file>"` (Reveal) for files, `open "<folder>"`
//   - Linux:   no cross-DE "select file" flag, so a file reveals its parent
//               dir via xdg-open; a folder opens directly.
// Resolves once the manager is launched; we don't wait for it to exit.
function revealPath(path: string): Promise<void> {
  return launchFileManager(path, true);
}

// Shared launcher for open-folder and reveal-path. `select` requests that a
// file be selected in the manager when supported; non-existent paths error.
function launchFileManager(path: string, select: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    stat(path)
      .then((info) => {
        const isDir = info.isDirectory();
        const platform = process.platform;
        let cmd: string;
        let args: string[];
        if (select && !isDir) {
          // Reveal + select a file.
          if (platform === "win32") {
            cmd = "explorer";
            args = ["/select,", path];
          } else if (platform === "darwin") {
            cmd = "open";
            args = ["-R", path];
          } else {
            // Linux: fall back to opening the containing directory.
            cmd = "xdg-open";
            args = [parentDir(path)];
          }
        } else {
          // Open a folder (or a file with no selection).
          if (!isDir) {
            throw new Error(`Not a folder: ${path}`);
          }
          cmd =
            platform === "win32"
              ? "explorer"
              : platform === "darwin"
                ? "open"
                : "xdg-open";
          args = [path];
        }
        const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
        child.on("error", (e) => {
          reject(
            new Error(`Could not open in file manager (${cmd}): ${toErrorMessage(e)}`),
          );
        });
        child.unref();
        // Resolve once launched; we don't wait for the file manager to exit.
        resolve();
      })
      .catch((e) => reject(e));
  });
}

// Best-effort parent directory of a path (for the Linux reveal fallback).
function parentDir(p: string): string {
  const sep = p.includes("/") ? "/" : "\\";
  const idx = p.lastIndexOf(sep);
  return idx > 0 ? p.slice(0, idx) : p;
}

// Merge two plain-text log blobs (each line `[ISO] message`) into a single
// chronologically ordered string. Lines without a parseable leading timestamp
// keep their relative order (stable sort), mirroring the dashboard's
// `mergeEntries`. Used by the /log-download route so the downloaded file
// matches what the UI shows.
function mergeLogText(
  outText: string,
  outStream: string,
  errText: string,
  errStream: string,
): string {
  type Row = { ts: number; seq: number; stream: string; line: string };
  const rows: Row[] = [];
  let seq = 0;
  const parse = (text: string, stream: string) => {
    for (const raw of text.split("\n")) {
      if (!raw) continue;
      const m = raw.match(/^\[(.+?)\]\s?(.*)$/);
      const ts = m ? Date.parse(m[1]) : NaN;
      rows.push({
        ts: Number.isNaN(ts) ? Number.MAX_SAFE_INTEGER : ts,
        seq: seq++,
        stream,
        line: m ? m[2] : raw,
      });
    }
  };
  parse(outText, outStream);
  parse(errText, errStream);
  // Stable sort preserves within-stream order for equal timestamps.
  rows.sort((a, b) => a.ts - b.ts || a.seq - b.seq);
  return rows
    .map((r) => {
      const iso = Number.isSafeInteger(r.ts) && r.ts !== Number.MAX_SAFE_INTEGER
        ? new Date(r.ts).toISOString()
        : new Date().toISOString();
      return `[${iso}]${r.stream === "stderr" ? ` [${r.stream}]` : ""} ${r.line}`;
    })
    .join("\n");
}

// Quote a single argv token for cmd.exe: wrap in double quotes and escape any
// embedded double quote with `\"`. Good enough for operator-provided values
// (not adversarial); values with spaces/special chars survive intact.
function quoteWin(token: string): string {
  return `"${token.replace(/"/g, '\\"')}"`;
}

// Quote a single argv token for POSIX shells (bash/zsh/sh): wrap in single
// quotes and escape embedded single quotes via the standard `'\''` sequence.
// This is robust against all shell metacharacters.
function quotePosix(token: string): string {
  return `'${token.replace(/'/g, "'\\''")}'`;
}

// Build a single-line, paste-and-run terminal command that reproduces how the
// process was spawned: `cd` into the cwd, export the env vars, then run
// `script args`. The syntax is chosen for the backend's own OS so the copied
// string runs when pasted into the matching shell:
//   - win32 → cmd.exe (`cd /d "..." && set "K=V" && "script" "args"`)
//   - other → POSIX/bash (`cd '...' && K='V' 'script' 'args'`)
// The `cd … &&` prefix is omitted when cwd is empty. envs are operator-set
// launch values, not the process's full inherited environment.
function buildCommand(opts: {
  script: string;
  args: string[];
  envs: Record<string, string>;
  cwd: string;
  platform: string;
}): string {
  const { script, args, envs, cwd, platform } = opts;
  const parts: string[] = [];

  if (cwd) {
    parts.push(
      platform === "win32" ? `cd /d ${quoteWin(cwd)}` : `cd ${quotePosix(cwd)}`,
    );
  }

  if (platform === "win32") {
    // cmd.exe: each env var as `set "KEY=VALUE"`. The surrounding quotes make
    // the value safe even with spaces / special chars.
    for (const [k, v] of Object.entries(envs)) {
      parts.push(`set "${k}=${v.replace(/"/g, '\\"')}"`);
    }
    parts.push([quoteWin(script), ...args.map(quoteWin)].join(" "));
  } else {
    // POSIX: env vars as inline `KEY='value'` assignments prefixing the command.
    const envPrefix = Object.entries(envs)
      .map(([k, v]) => `${k}=${quotePosix(v)}`)
      .join(" ");
    const invocation = [quotePosix(script), ...args.map(quotePosix)].join(" ");
    parts.push(envPrefix ? `${envPrefix} ${invocation}` : invocation);
  }

  return parts.join(" && ");
}

// Resolve a process for log-serving purposes: live in-memory metadata first
// (carries the stdout/stderr clients + envs), else fall back to the persisted
// record (carries the on-disk log paths). Returns null only when neither
// exists — a true 404. Used by the logs/log-files/log-download routes so a
// stopped/expired process's logs stay accessible after its clients are gone.
type ResolvedProcess =
  | { kind: "live"; meta: ProcessMetadata }
  | { kind: "record"; record: ProcessRecord };

async function resolveProcess(
  id: string,
): Promise<ResolvedProcess | null> {
  const meta = getProcess(id);
  if (meta) return { kind: "live", meta };
  const record = await getProcessRecord(id);
  if (record) return { kind: "record", record };
  return null;
}

// The on-disk stdout/stderr .log paths for a resolved process. `null` when
// unknown (a live process always has paths; a legacy record written before
// paths were persisted may not).
function logFilePathsOf(rp: ResolvedProcess): {
  stdoutPath: string | null;
  stderrPath: string | null;
} {
  if (rp.kind === "live") {
    return {
      stdoutPath: rp.meta.stdoutClient.textFilePath,
      stderrPath: rp.meta.stderrClient.textFilePath,
    };
  }
  return {
    stdoutPath: rp.record.stdoutLogPath ?? null,
    stderrPath: rp.record.stderrLogPath ?? null,
  };
}

// Read a log file, returning "" when it doesn't exist yet (no output / process
// never wrote). Used for both tail and download of record-sourced logs.
async function readLogFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw e;
  }
}

// Log file names are `<processId>-<stdout|stderr>.log`. The greedy `.+` keeps
// ids containing dashes (nanoid's alphabet includes `-`) intact.
const LOG_FILE_NAME_RE = /^(.+)-(stdout|stderr)\.log$/;

// Cap on the text returned by /api/log-files/content. Larger files are
// tail-cut to the last 10MB so a runaway process can't blow up the browser.
const MAX_LOG_FILE_CONTENT_BYTES = 10 * 1024 * 1024;

// Read a log file for the history view, capped at MAX_LOG_FILE_CONTENT_BYTES.
// Oversized files return only the trailing bytes (logs are newest-last), with
// the leading partial line dropped so the text starts on a line boundary.
async function readLogFileCapped(
  filePath: string,
): Promise<{ text: string; truncated: boolean }> {
  const st = await stat(filePath).catch(() => null);
  if (!st || st.size <= MAX_LOG_FILE_CONTENT_BYTES) {
    return { text: await readLogFile(filePath), truncated: false };
  }
  const len = MAX_LOG_FILE_CONTENT_BYTES;
  const fh = await open(filePath, "r");
  try {
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, st.size - len);
    let text = buf.toString("utf8");
    const nl = text.indexOf("\n");
    if (nl !== -1) text = text.slice(nl + 1);
    return { text, truncated: true };
  } finally {
    await fh.close();
  }
}

// Return the last `count` lines of a raw log blob (record-sourced logs have no
// timestamps, so we tail by line). Empty input → empty string.
function tailLogFile(fullText: string, count: number): string {
  const lines = fullText.split("\n");
  // Drop a single trailing empty line from the final \n, if present.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const start = Math.max(0, lines.length - count);
  return lines.slice(start).join("\n");
}

// Grep a raw log blob (record-sourced): keep lines matching the regex, capped
// at `count` matches. `after` adds up to that many trailing lines following
// each match as context (deduped). Invalid regex falls back to a literal
// substring match.
function grepLogFile(
  fullText: string,
  pattern: string,
  ignoreCaseParam: string | null,
  count: number,
  after = 0,
): string {
  const ignoreCase = (ignoreCaseParam || "").toLowerCase() === "1";
  const afterCount = Math.max(0, after);
  const lines = fullText.split("\n");

  // Returns the indices of the most recent `count` matching lines.
  const matchIndices = (test: (l: string) => boolean): number[] => {
    const idx: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (test(lines[i])) idx.push(i);
    }
    return idx.slice(-count);
  };

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, ignoreCase ? "i" : "");
  } catch {
    // Fall back to literal substring matching on regex parse failure.
    const needle = ignoreCase ? pattern.toLowerCase() : pattern;
    const test = (l: string) =>
      ignoreCase ? l.toLowerCase().includes(needle) : l.includes(needle);
    const matched = matchIndices(test);
    if (matched.length === 0) return "";
    if (afterCount === 0) return matched.map((i) => lines[i]).join("\n");
    const keep = new Set<number>(matched);
    for (const start of matched) {
      const end = Math.min(lines.length - 1, start + afterCount);
      for (let j = start + 1; j <= end; j++) keep.add(j);
    }
    return Array.from(keep)
      .sort((a, b) => a - b)
      .map((i) => lines[i])
      .join("\n");
  }
  const matched = matchIndices((l) => regex.test(l));
  if (matched.length === 0) return "";
  if (afterCount === 0) return matched.map((i) => lines[i]).join("\n");
  const keep = new Set<number>(matched);
  for (const start of matched) {
    const end = Math.min(lines.length - 1, start + afterCount);
    for (let j = start + 1; j <= end; j++) keep.add(j);
  }
  return Array.from(keep)
    .sort((a, b) => a - b)
    .map((i) => lines[i])
    .join("\n");
}

// Read a stopped/expired process's plain-text log stream.
async function readRecordLogText(
  logFilePath: string,
  grepPattern: string | null,
  ignoreCase: boolean,
  count: number,
  after = 0,
): Promise<string> {
  const fullText = await readLogFile(logFilePath);
  if (grepPattern !== null) {
    return grepLogFile(
      fullText,
      grepPattern,
      ignoreCase ? "1" : null,
      count,
      after,
    );
  }
  return tailLogFile(fullText, count);
}

// Build the request handler. Shared by both modes (MCP+HTTP and HTTP-only).
function createRequestHandler(token: string | undefined) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const method = req.method || "GET";
      const pathname = url.pathname;

      // Browser MCP clients send an unauthenticated CORS preflight. It must
      // reach the MCP handler before the optional HTTP token check.
      if (method === "OPTIONS" && pathname === "/mcp") {
        await handleMcpRequest(req, res);
        return;
      }

      // Auth check applies to everything.
      if (token) {
        const auth = req.headers["authorization"] || "";
        const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (provided !== token) {
          json(res, 401, { error: "Unauthorized" });
          return;
        }
      }

      // GET /  -> built React dashboard, or a fallback page if not built yet.
      if (method === "GET" && pathname === "/") {
        const dashboardState = currentDashboardState();
        if (dashboardState.available && dashboardState.index) {
          html(res, 200, dashboardState.index);
        } else {
          html(res, 200, dashboardNotBuiltHtml());
        }
        return;
      }

      // Static assets from the built dashboard (e.g. /assets/index-*.js|css).
      // Only served when the bundle exists.
      if (
        method === "GET" &&
        pathname.startsWith("/assets/")
      ) {
        const dashboardState = currentDashboardState();
        if (!dashboardState.available || !dashboardState.distDir) {
          const message = `Dashboard asset requested but bundle is unavailable: request=${pathname}`;
          serverLog(message);
          console.error(`procm-mcp: ${message}`);
          json(res, 404, { error: "Dashboard bundle not found" });
          return;
        }
        const file = readDashboardAsset(dashboardState.distDir, pathname);
        if (file) {
          asset(res, 200, file.body, file.contentType);
        } else {
          const referencedAssets = Array.from(
            dashboardState.index?.matchAll(/(?:src|href)=["']([^"']+)["']/g) ?? [],
            (match) => match[1],
          );
          const message =
            `Dashboard asset not found: request=${pathname}, dist=${dashboardState.distDir}, ` +
            `currentIndexAssets=${referencedAssets.join(",") || "none"}. ` +
            "The browser may have stale HTML from before a build/link; reload the page.";
          serverLog(message);
          console.error(`procm-mcp: ${message}`);
          json(res, 404, { error: "Asset not found" });
        }
        return;
      }

      // /mcp -> MCP Streamable HTTP transport (real MCP protocol endpoint).
      if (await handleMcpRequest(req, res)) {
        return;
      }

      // GET /api/meta -> server metadata (cwd, etc.) for dashboard conveniences
      // like preset auto-fill.
      if (method === "GET" && pathname === "/api/meta") {
        json(res, 200, {
          serverId,
          pid: process.pid,
          cwd: process.cwd(),
          startedAt: serverStartedAt,
        });
        return;
      }

      if (method === "GET" && pathname === "/api/rooms") {
        json(res, 200, { rooms: await listRooms() });
        return;
      }

      // GET /api/log-files -> every on-disk process log file this server has
      // written (including processes since deleted), newest-modified first.
      // Powers the dashboard's history-log tab.
      if (method === "GET" && pathname === "/api/log-files") {
        json(res, 200, { files: await listProcessLogFiles() });
        return;
      }

      // DELETE /api/log-files -> bulk-delete the on-disk process log files
      // whose owning process is not currently running (live running/spawning
      // processes keep their files — they are still being written). Returns
      // { deleted, skipped } file-name lists.
      if (method === "DELETE" && pathname === "/api/log-files") {
        json(res, 200, await deleteProcessLogFiles());
        return;
      }

      // GET /api/log-files/content?path=<absolute path> -> the file's full
      // text. The path must name a `<id>-<stream>.log` file inside the
      // procm-mcp data root (any server generation's dir), so the route can
      // never be aimed at arbitrary files.
      if (method === "GET" && pathname === "/api/log-files/content") {
        const raw = url.searchParams.get("path") || "";
        const filePath = path.normalize(raw);
        const root = path.normalize(ProcmMcpDir() + path.sep);
        if (
          !LOG_FILE_NAME_RE.test(path.basename(filePath)) ||
          !filePath.startsWith(root)
        ) {
          json(res, 400, { error: "Invalid log file path" });
          return;
        }
        try {
          const { text, truncated } = await readLogFileCapped(filePath);
          json(res, 200, { path: filePath, text, truncated });
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === "ENOENT") {
            json(res, 200, { path: filePath, text: "", truncated: false });
            return;
          }
          throw e;
        }
        return;
      }

      const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(logs))?$/);
      if (roomMatch) {
        const roomId = decodeURIComponent(roomMatch[1]);
        const roomAction = roomMatch[2];
        if (method === "GET" && roomAction === "logs") {
          const levelParam = url.searchParams.get("level");
          const level = ["debug", "info", "warn", "error"].includes(levelParam ?? "")
            ? levelParam as "debug" | "info" | "warn" | "error"
            : undefined;
          const entries = await queryRoomLogs(roomId, {
            memberPrefix: url.searchParams.get("memberPrefix") || undefined,
            level,
            traceId: url.searchParams.get("traceId") || undefined,
            count: Number(url.searchParams.get("count")) || undefined,
          });
          if (!entries) json(res, 404, { error: `Room ${roomId} not found` });
          else json(res, 200, { roomId, entries });
          return;
        }
        if (method === "GET" && !roomAction) {
          const room = await getRoom(roomId);
          if (!room) json(res, 404, { error: `Room ${roomId} not found` });
          else json(res, 200, room);
          return;
        }
        if ((method === "PATCH" || method === "POST") && !roomAction) {
          const body = JSON.parse((await readBody(req)) || "{}");
          json(res, 200, await patchRoom(roomId, {
            title: body.title === undefined ? undefined : String(body.title),
            note: body.note === undefined ? undefined : String(body.note),
          }));
          return;
        }
      }

      // POST /api/select-directory -> open the OS-native directory picker
      // (native-file-dialog, a Rust addon over the OS dialogs; Windows/macOS).
      // The browser can't do this, so the dashboard asks the backend. The
      // picker is synchronous — it blocks the event loop until the user
      // chooses, which is fine for this local single-user tool. Resolves
      // { canceled: true } when the user dismisses the picker.
      if (method === "POST" && pathname === "/api/select-directory") {
        try {
          const dir = pickDirectory().trim();
          if (!dir || dir === "UserCancelled") {
            json(res, 200, { canceled: true, path: null });
            return;
          }
          json(res, 200, { canceled: false, path: dir });
        } catch (e) {
          json(res, 500, { error: toErrorMessage(e) });
        }
        return;
      }

      // POST /api/favorites/scan -> scan a folder's top-level project manifests
      // (package.json / pyproject.toml / Cargo.toml) and return candidate
      // launch commands the dashboard can selectively import into process groups.
      if (method === "POST" && pathname === "/api/favorites/scan") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const dir = String(body.path || "").trim();
        if (!dir) {
          json(res, 400, { error: "path is required" });
          return;
        }
        try {
          const candidates = await scanProjectCommands(dir);
          json(res, 200, { candidates });
        } catch (e) {
          json(res, 400, { error: toErrorMessage(e) });
        }
        return;
      }

      if (method === "POST" && pathname === "/api/processes/import") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const script = String(body.script || "").trim();
        const cwd = String(body.cwd || "").trim();
        if (!script || !cwd || !Array.isArray(body.args)) {
          json(res, 400, { error: "script, cwd and args are required" });
          return;
        }
        const saved = await saveProcessRecord({
          name: body.name ? String(body.name) : undefined,
          script,
          args: body.args.map(String),
          cwd,
          desc: body.desc ? String(body.desc) : undefined,
          group: body.group ? String(body.group).trim() : null,
          favorite: true,
        });
        json(res, 201, { id: saved.id, name: saved.name, favorite: true });
        return;
      }

      // POST /api/processes/import-batch -> import several stopped favorite
      // records in one request (the dashboard's directory import). `group`
      // applies to every item; items are validated up front so a bad batch
      // fails without writing anything.
      if (method === "POST" && pathname === "/api/processes/import-batch") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const items = Array.isArray(body.items) ? body.items : [];
        if (items.length === 0) {
          json(res, 400, { error: "items must be a non-empty array" });
          return;
        }
        const group = body.group ? String(body.group).trim() : null;
        for (const item of items) {
          const script = String(item?.script || "").trim();
          const cwd = String(item?.cwd || "").trim();
          if (!script || !cwd || !Array.isArray(item?.args)) {
            json(res, 400, { error: "each item requires script, cwd and args" });
            return;
          }
        }
        const imported: { id: string; name: string; favorite: boolean }[] = [];
        for (const item of items) {
          const saved = await saveProcessRecord({
            name: item.name ? String(item.name) : undefined,
            script: String(item.script).trim(),
            args: item.args.map(String),
            cwd: String(item.cwd).trim(),
            desc: item.desc ? String(item.desc) : undefined,
            group,
            favorite: true,
          });
          imported.push({ id: saved.id, name: saved.name, favorite: true });
        }
        json(res, 201, { imported });
        return;
      }

      // POST /api/open-folder -> reveal a folder in the OS file manager. Used by
      // the favorites view's per-group "open folder" action. The browser can't
      // do this directly, so the backend shells out (explorer/open/xdg-open).
      // The path is validated to exist and be a directory first.
      if (method === "POST" && pathname === "/api/open-folder") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const dir = String(body.path || "").trim();
        if (!dir) {
          json(res, 400, { error: "path is required" });
          return;
        }
        try {
          await openInFileManager(dir);
          json(res, 200, { ok: true });
        } catch (e) {
          json(res, 400, { error: toErrorMessage(e) });
        }
        return;
      }

      // POST /api/reveal -> reveal a path in the OS file manager. Like
      // /api/open-folder but also handles files, selecting them in the manager
      // (used by the System tab's "Open process location" to show the exe).
      if (method === "POST" && pathname === "/api/reveal") {
        const body = JSON.parse((await readBody(req)) || "{}");
        const target = String(body.path || "").trim();
        if (!target) {
          json(res, 400, { error: "path is required" });
          return;
        }
        try {
          await revealPath(target);
          json(res, 200, { ok: true });
        } catch (e) {
          json(res, 400, { error: toErrorMessage(e) });
        }
        return;
      }

      // GET /api/system-processes -> enumerate all running OS processes for the
      // System tab. Unlike /api/processes (which tracks procm-mcp's own spawned
      // processes), this lists everything the host OS is running. Returns
      // pid/ppid/name plus full command line + exe path when the platform
      // exposes them (Windows does; ps-list on Unix gives the command line).
      if (method === "GET" && pathname === "/api/system-processes") {
        try {
          const processes = await listSystemProcesses();
          json(res, 200, { processes });
        } catch (e) {
          json(res, 500, { error: toErrorMessage(e) });
        }
        return;
      }

      // POST /api/system-processes/:pid/kill -> terminate a process and its
      // whole descendant tree (tree-kill -> taskkill /T /F on Windows).
      // Protected pids (idle/system/self) are refused by the helper.
      const sysKillMatch = pathname.match(
        /^\/api\/system-processes\/(\d+)\/kill$/,
      );
      if (method === "POST" && sysKillMatch) {
        const pid = Number(sysKillMatch[1]);
        try {
          await killProcessTree(pid);
          json(res, 200, { ok: true, pid });
        } catch (e) {
          json(res, 400, { error: toErrorMessage(e) });
        }
        return;
      }

      // GET /api/system-processes/port/:port -> find the process(es) listening
      // on a TCP port (the toolbar "view port" lookup), via find-process.
      // Returns an empty array when nothing is listening on that port.
      const portMatch = pathname.match(
        /^\/api\/system-processes\/port\/(\d+)$/,
      );
      if (method === "GET" && portMatch) {
        const port = Number(portMatch[1]);
        try {
          const processes = await findProcessByPort(port);
          json(res, 200, { port, processes });
        } catch (e) {
          json(res, 500, { error: toErrorMessage(e) });
        }
        return;
      }

      // /api/processes[/:id[/action]]
      const apiMatch = pathname.match(
        /^\/api\/processes(?:\/([^/]+))?(?:\/(stop|restart|logs|log-files|log-download|command|input))?$/,
      );
      if (apiMatch) {
        const [, idParam, action] = apiMatch;

        // GET /api/processes
        if (method === "GET" && !idParam) {
          // Merge live + historical (stopped/exited) records so expired
          // processes remain visible across restarts. Optional query filters
          // (group/status/roomId/search) combine with AND; each is skipped
          // when empty. `search` is a case-insensitive substring over
          // name/script/cwd, mirroring the dashboard's list filter.
          const records = await listProcessRecords();
          const group = url.searchParams.get("group")?.trim() || null;
          const status = url.searchParams.get("status")?.trim() || null;
          const roomId = url.searchParams.get("roomId")?.trim() || null;
          const search = url.searchParams.get("search")?.trim().toLowerCase() || null;
          const filtered = records.filter(
            (r) =>
              (!group || (r.group ?? null) === group) &&
              (!status || r.status === status) &&
              (!roomId || (r.roomId ?? null) === roomId) &&
              (!search ||
                `${r.name}\n${r.script}\n${r.cwd}`.toLowerCase().includes(search)),
          );
          json(res, 200, {
            serverId,
            pid: process.pid,
            startedAt: serverStartedAt,
            processes: filtered.map(toPublicRecord),
          });
          return;
        }

        // POST /api/processes  -> start
        if (method === "POST" && !idParam) {
          const body = JSON.parse((await readBody(req)) || "{}");
          const script = String(body.script || "").trim();
          const cwd = String(body.cwd || "").trim();
          if (!script || !cwd) {
            json(res, 400, { error: "script and cwd are required" });
            return;
          }
          const validateError = validateScript(script);
          if (validateError) {
            json(res, 400, { error: validateError });
            return;
          }
          const name = body.name ? String(body.name) : undefined;
          const overwrite = body.overwrite === true;
          const restart = body.restart === true;
          const args: string[] = Array.isArray(body.args)
            ? body.args.map(String)
            : [];
          const envs: Record<string, string> =
            body.envs && typeof body.envs === "object" && !Array.isArray(body.envs)
              ? body.envs
              : {};
          const desc = body.desc ? String(body.desc) : undefined;
          const group = body.group ? String(body.group).trim() : null;
          const favorite = body.favorite === true;
          const roomId = body.roomId ? String(body.roomId).trim() : null;
          // Optional port the process serves on. Coerced to an integer and
          // range-checked; anything invalid is rejected so the dashboard's
          // one-click open link never points at a bogus URL.
          const rawPort = Number(body.port);
          const port =
            body.port !== undefined && body.port !== null &&
            Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535
              ? rawPort
              : null;
          if (body.port !== undefined && body.port !== null && port === null) {
            json(res, 400, { error: "port must be an integer between 1 and 65535" });
            return;
          }

          // A name identifies one dashboard entry. Require explicit opt-in to
          // replace an existing record, and require restart for a live one so
          // accidental duplicate launches cannot create repeated rows.
          if (name) {
            const existing = (await listProcessRecords()).filter((p) => p.name === name);
            if (existing.length > 0) {
              if (!overwrite) {
                json(res, 409, { error: `A process named "${name}" already exists; set overwrite=true to replace it.` });
                return;
              }
              const running = existing.some((p) => p.status === "running" || p.status === "spawning");
              if (running && !restart) {
                json(res, 409, { error: `Process "${name}" is running; set restart=true to replace it.` });
                return;
              }
              for (const process of existing) {
                await deleteProcess(process.id);
              }
            }
          }
          const processId = generateProcessId();
          const started = await startProcess(
            processId,
            script,
            name,
            args,
            cwd,
            envs,
            desc,
            port,
            roomId,
            group,
          );
          started.favorite = favorite;
          pushProcess(started);
          json(res, 201, { id: processId, name: started.name });
          return;
        }

        // DELETE /api/processes  -> bulk delete (the dashboard "clear all").
        // Body: { ids?: string[] }. When ids is omitted/empty, every current
        // record (live + historical) is targeted. Done server-side so the
        // in-memory list and the durable store are mutated in one pass each —
        // fanning out per-id DELETEs races in lowdb and resurrects rows.
        if (method === "DELETE" && !idParam) {
          const body = JSON.parse((await readBody(req)) || "{}");
          let ids: string[] =
            Array.isArray(body.ids) ? body.ids.map(String) : [];
          if (ids.length === 0) {
            // No explicit list: clear everything currently known.
            const records = await listProcessRecords();
            ids = records.map((r) => r.id);
          }
          const result = await deleteProcesses(ids);
          json(res, 200, result);
          return;
        }

        if (!idParam) {
          json(res, 404, { error: "Not found" });
          return;
        }

        if (action === "logs") {
          if (method !== "GET" && method !== "DELETE") {
            json(res, 405, { error: "Method not allowed" });
            return;
          }
          const rp = await resolveProcess(idParam);
          if (!rp) {
            json(res, 404, { error: "Process not found" });
            return;
          }

          // DELETE /api/processes/:id/logs -> clear both stdout and stderr
          // histories for this process. Live clients serialize the truncate
          // with pending appends; historical records are truncated directly.
          if (method === "DELETE") {
            if (rp.kind === "live") {
              await Promise.all([
                rp.meta.stdoutClient.clear(),
                rp.meta.stderrClient.clear(),
              ]);
            } else {
              const paths = logFilePathsOf(rp);
              await Promise.all(
                [paths.stdoutPath, paths.stderrPath]
                  .filter((filePath): filePath is string => !!filePath)
                  .map((filePath) => writeFile(filePath, "", "utf8")),
              );
            }
            json(res, 200, { id: idParam, cleared: true });
            return;
          }

          const stream = (url.searchParams.get("stream") || "stdout") as
            | "stdout"
            | "stderr";
          const count = Number(url.searchParams.get("count") || "200");

          // Stopped/expired process: no in-memory client, so serve the plain
          // text log from disk. Historical lines have no timestamps.
          if (rp.kind === "record") {
            const paths = logFilePathsOf(rp);
            const textFilePath =
              stream === "stderr" ? paths.stderrPath : paths.stdoutPath;
            if (!textFilePath) {
              json(res, 200, { stream, text: "" });
              return;
            }
            const grepPattern = url.searchParams.get("grep");
            const ignoreCase =
              (url.searchParams.get("ignoreCase") || "").toLowerCase() === "1";
            const after = Number(url.searchParams.get("after") || "0");

            const text = await readRecordLogText(
              textFilePath,
              grepPattern,
              ignoreCase,
              count,
              after,
            );
            json(res, 200, { stream, text });
            return;
          }

          const meta = rp.meta;
          const client =
            stream === "stderr" ? meta.stderrClient : meta.stdoutClient;

          // Optional grep: if `grep` is present, search instead of tailing.
          const grepPattern = url.searchParams.get("grep");
          if (grepPattern !== null) {
            const ignoreCase =
              (url.searchParams.get("ignoreCase") || "").toLowerCase() === "1";
            const after = Number(url.searchParams.get("after") || "0");
            let regex: RegExp;
            try {
              regex = new RegExp(grepPattern, ignoreCase ? "i" : "");
            } catch (e) {
              json(res, 400, { error: `Invalid regex: ${toErrorMessage(e)}` });
              return;
            }
            const chunks = await client.search(regex, count, after);
            const text = chunks
              .map((c) => `[${c.timestamp.toISOString()}] ${c.message}`)
              .join("\n");
            json(res, 200, { stream, grep: grepPattern, text });
            return;
          }

          const chunks = await client.top(count);
          const text = chunks
            .map((c) => `[${c.timestamp.toISOString()}] ${c.message}`)
            .join("\n");
          json(res, 200, { stream, text });
          return;
        }

        // GET /api/processes/:id/log-files -> absolute paths of the two
        // on-disk plain-text log files, so the dashboard can offer a
        // "copy file location" action. The browser can't reconstruct these
        // (they live under os.tmpdir()), so the backend must supply them.
        // Resolves live OR persisted record so stopped/expired processes still
        // expose their file locations.
        if (action === "log-files") {
          if (method !== "GET") {
            json(res, 405, { error: "Method not allowed" });
            return;
          }
          const rp = await resolveProcess(idParam);
          if (!rp) {
            json(res, 404, { error: "Process not found" });
            return;
          }
          const paths = logFilePathsOf(rp);
          json(res, 200, paths);
          return;
        }

        // GET /api/processes/:id/command -> a single-line, paste-and-run
        // terminal command that reproduces how the process was spawned (cd to
        // cwd + env-var prefixes + `script args`), formatted for the backend's
        // own OS. Resolves live OR persisted record so any process that has
        // ever run can copy its command. envs are persisted on records now, so
        // even a historical record's command includes env-var prefixes; older
        // records written before envs were persisted fall back to none.
        if (action === "command") {
          if (method !== "GET") {
            json(res, 405, { error: "Method not allowed" });
            return;
          }
          const rp = await resolveProcess(idParam);
          if (!rp) {
            json(res, 404, { error: "Process not found" });
            return;
          }
          const { script, args, cwd } =
            rp.kind === "live" ? rp.meta : rp.record;
          const envs =
            rp.kind === "live" ? rp.meta.envs : rp.record.envs ?? {};
          json(res, 200, {
            command: buildCommand({
              script,
              args,
              envs,
              cwd,
              platform: process.platform,
            }),
          });
          return;
        }

        // GET /api/processes/:id/log-download -> the merged, chronologically
        // ordered log file as a downloadable attachment. Reads the two
        // append-only .log files directly (the real on-disk data, not a
        // count-capped reconstruction) and merges them the same way the
        // dashboard does: stable sort by the leading `[ISO]` timestamp.
        // Resolves live OR persisted record so stopped/expired processes stay
        // downloadable.
        if (action === "log-download") {
          if (method !== "GET") {
            json(res, 405, { error: "Method not allowed" });
            return;
          }
          const rp = await resolveProcess(idParam);
          if (!rp) {
            json(res, 404, { error: "Process not found" });
            return;
          }
          const { stdoutPath, stderrPath } = logFilePathsOf(rp);
          const [outText, errText] = await Promise.all([
            stdoutPath ? readLogFile(stdoutPath) : "",
            stderrPath ? readLogFile(stderrPath) : "",
          ]);
          const merged = mergeLogText(outText, "stdout", errText, "stderr");
          const payload = Buffer.from(merged, "utf8");
          const name = rp.kind === "live" ? rp.meta.name : rp.record.name;
          // Sanitize the filename: keep word chars, dashes, dots; drop the rest.
          const safeName = (name || idParam).replace(/[^\w.-]+/g, "_");
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${safeName}-${idParam}.log"`,
            "Content-Length": payload.length,
          });
          res.end(payload);
          return;
        }

        if (action === "stop") {
          if (method !== "POST") {
            json(res, 405, { error: "Method not allowed" });
            return;
          }
          const ok = await removeProcess(idParam);
          if (!ok) {
            json(res, 404, { error: "Process not found" });
            return;
          }
          json(res, 200, { id: idParam, stopped: true });
          return;
        }

        if (action === "restart") {
          if (method !== "POST") {
            json(res, 405, { error: "Method not allowed" });
            return;
          }
          const restarted = await restartProcess(idParam);
          if (!restarted) {
            json(res, 404, { error: "Process not found" });
            return;
          }
          json(res, 200, { id: idParam, restarted: true });
          return;
        }

        // POST /api/processes/:id/input -> write to the process's stdin or
        // send it an OS signal. Body: { text?, newline?, signal? }. Exactly
        // one of text/signal must be present. Used by the dashboard's log
        // panel input bar and Ctrl+C button. Mirrors the MCP process-input
        // tool; both go through sendProcessInput for the validation/typing.
        if (action === "input") {
          if (method !== "POST") {
            json(res, 405, { error: "Method not allowed" });
            return;
          }
          const body = JSON.parse((await readBody(req)) || "{}");
          const result = sendProcessInput(idParam, {
            text: typeof body.text === "string" ? body.text : undefined,
            newline: typeof body.newline === "boolean" ? body.newline : undefined,
            signal: typeof body.signal === "string" ? body.signal : undefined,
          });
          if (result.ok) {
            json(res, 200, { id: idParam, ...result });
            return;
          }
          const status = result.reason === "not_found" ? 404 : 400;
          json(res, status, { id: idParam, error: result.error || result.reason });
          return;
        }

        // PATCH /api/processes/:id -> merge user-edited fields (and/or the
        // persisted UI favorite flag) into the live process and its record.
        if (method === "PATCH" && !action) {
          const body = JSON.parse((await readBody(req)) || "{}");
          const updates: ProcessFieldUpdates & { favorite?: boolean } = {};
          if (typeof body.name === "string" && body.name.trim())
            updates.name = body.name.trim();
          if (typeof body.script === "string" && body.script.trim())
            updates.script = body.script.trim();
          if (Array.isArray(body.args) && body.args.every((a: unknown) => typeof a === "string"))
            updates.args = body.args as string[];
          if (typeof body.cwd === "string" && body.cwd.trim())
            updates.cwd = body.cwd.trim();
          if (typeof body.desc === "string")
            updates.desc = body.desc.trim() || null;
          if (body.port === null) updates.port = null;
          else if (typeof body.port === "number" && Number.isInteger(body.port) && body.port >= 1 && body.port <= 65535)
            updates.port = body.port;
          if (body.envs && typeof body.envs === "object" && !Array.isArray(body.envs))
            updates.envs = body.envs as Record<string, string>;
          if (typeof body.favorite === "boolean") updates.favorite = body.favorite;
          if (Object.keys(updates).length === 0) {
            json(res, 400, { error: "No valid fields to update" });
            return;
          }
          if (updates.favorite !== undefined) {
            await setProcessFavorite(idParam, updates.favorite);
          }
          const updated = await updateProcessFields(idParam, updates);
          if (!updated) {
            json(res, 404, { error: "Process not found" });
            return;
          }
          const live = getProcess(idParam);
          if (live) {
            json(res, 200, toPublicView(live));
            return;
          }
          const record = await getProcessRecord(idParam);
          json(res, 200, record ? toPublicRecord(record) : { id: idParam, favorite: body.favorite });
          return;
        }

        // DELETE /api/processes/:id  -> stop (if running) and erase the record
        if (method === "DELETE" && !action) {
          const ok = await deleteProcess(idParam);
          if (!ok) {
            json(res, 404, { error: "Process not found" });
            return;
          }
          json(res, 200, { id: idParam, deleted: true });
          return;
        }

        // GET /api/processes/:id
        if (method === "GET" && !action) {
          const meta = getProcess(idParam);
          if (!meta) {
            json(res, 404, { error: "Process not found" });
            return;
          }
          json(res, 200, toPublicView(meta));
          return;
        }

        json(res, 404, { error: "Not found" });
        return;
      }

      json(res, 404, { error: "Not found" });
    } catch (error) {
      serverLog(`HTTP error: ${toErrorMessage(error)}`);
      if (!res.headersSent) {
        json(res, 500, { error: toErrorMessage(error) });
      } else {
        res.end();
      }
    }
  };
}

// Create and start the dashboard HTTP server on a given port.
// Bound to 127.0.0.1 only. If PROCM_HTTP_TOKEN is set, requests must carry
// `Authorization: Bearer <token>`.
// Resolves once listening; rejects (with a friendly message on EADDRINUSE) on
// failure so the caller can surface it instead of letting it reach
// `uncaughtException`.
export function startHttpServer(port: number): Promise<http.Server> {
  const dashboardState = currentDashboardState();
  if (dashboardState.available) {
    serverLog(`Serving built dashboard from ${dashboardState.distDir}`);
  } else {
    serverLog(
      "Dashboard bundle not found (dashboard/dist). Run `npm run build:dashboard`. Serving fallback page at /.",
    );
  }
  const token = process.env.PROCM_HTTP_TOKEN;
  setConnectionConfig(port, token);
  const server = http.createServer(createRequestHandler(token));

  return new Promise<http.Server>((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} is already in use. Choose another with --port <number> or PROCM_HTTP_PORT, or stop the process holding port ${port}.`,
          ),
        );
      } else {
        reject(err);
      }
    });

    server.listen(port, HOST, () => {
      serverLog(
        `Dashboard HTTP server listening on http://${HOST}:${port}` +
          (token ? " (token protected)" : ""),
      );
      // Attach the WebSocket endpoint for real-time process and log updates.
      attachWebsocketServer(server, token, {
        serverId,
        pid: process.pid,
        startedAt: serverStartedAt,
      });
      resolve(server);
    });
  });
}

// Start the dashboard HTTP server if PROCM_HTTP_PORT is set.
export function startHttpServerIfConfigured(): Promise<http.Server | undefined> {
  const portStr = process.env.PROCM_HTTP_PORT;
  if (!portStr) {
    return Promise.resolve(undefined);
  }
  const port = Number(portStr);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    serverLog(`Invalid PROCM_HTTP_PORT "${portStr}", HTTP dashboard disabled.`);
    return Promise.resolve(undefined);
  }
  return startHttpServer(port);
}
