import http from "http";
import { readFile, stat } from "fs/promises";
import { spawn } from "child_process";
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
} from "./process-manager.js";
import type { ProcessRecord } from "./processes-repository.js";
import { toErrorMessage } from "./error.js";
import { ProcessMetadata } from "./types.js";
import { handleMcpRequest } from "./mcp-http.js";
import { attachWebsocketServer } from "./websocket-server.js";
import { scanProjectCommands } from "./project-scanner.js";
import { createLogsRepository } from "./logs-repository.js";

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

// Dashboard bundle state is resolved once per server start. If unavailable,
// GET / falls back to the "not built" page; assets 404.
const dashboardState = getDashboardServeState();
if (dashboardState.available) {
  serverLog(`Serving built dashboard from ${dashboardState.distDir}`);
} else {
  serverLog(
    "Dashboard bundle not found (dashboard/dist). Run `npm run build:dashboard`. Serving fallback page at /.",
  );
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
  return new Promise((resolve, reject) => {
    stat(dir)
      .then((info) => {
        if (!info.isDirectory()) {
          throw new Error(`Not a folder: ${dir}`);
        }
        const platform = process.platform;
        // Windows: explorer; macOS: open; Linux/other: xdg-open.
        const [cmd, args] =
          platform === "win32"
            ? ["explorer", [dir]]
            : platform === "darwin"
              ? ["open", [dir]]
              : ["xdg-open", [dir]];
        const child = spawn(cmd, args, {
          detached: true,
          stdio: "ignore",
        });
        child.on("error", (e) => {
          reject(
            new Error(`Could not open folder (${cmd}): ${toErrorMessage(e)}`),
          );
        });
        child.unref();
        // Resolve once launched; we don't wait for the file manager to exit.
        resolve();
      })
      .catch((e) => reject(e));
  });
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
// at `count` matches. Invalid regex falls back to a literal substring match.
function grepLogFile(
  fullText: string,
  pattern: string,
  ignoreCaseParam: string | null,
  count: number,
): string {
  const ignoreCase = (ignoreCaseParam || "").toLowerCase() === "1";
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, ignoreCase ? "i" : "");
  } catch {
    // Fall back to literal substring matching on regex parse failure.
    const needle = ignoreCase ? pattern.toLowerCase() : pattern;
    const matched = fullText
      .split("\n")
      .filter((l) =>
        ignoreCase ? l.toLowerCase().includes(needle) : l.includes(needle),
      );
    return matched.slice(0, count).join("\n");
  }
  return fullText
    .split("\n")
    .filter((l) => regex.test(l))
    .slice(0, count)
    .join("\n");
}

// Read a stopped/expired process's log stream as `[ISO] message` lines.
// Prefers the sibling lowdb `.json` store (each record has its own timestamp,
// so lines are correctly separated and sortable), recovering the store path by
// swapping the persisted `.log` path's extension. Falls back to the raw `.log`
// text file (now line-delimited) when the JSON store is missing or empty — for
// records from a previous backend session whose tmp dir no longer exists.
async function readRecordLogText(
  logFilePath: string,
  grepPattern: string | null,
  ignoreCase: boolean,
  count: number,
): Promise<string> {
  const jsonPath = logFilePath.replace(/\.log$/, ".json");
  try {
    const repo = await createLogsRepository(jsonPath);
    await repo.initialize();
    // top()/search() return newest-first; reverse for oldest-first so a tail
    // shows the most recent `count` lines at the bottom (matching the live view).
    const records =
      grepPattern !== null
        ? await repo.search(new RegExp(grepPattern, ignoreCase ? "i" : ""), count)
        : await repo.top(count);
    await repo.close();
    if (records.length > 0) {
      return records
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((r) => `[${new Date(r.timestamp).toISOString()}] ${r.message}`)
        .join("\n");
    }
    // Empty JSON store: fall through to the .log file.
  } catch {
    // JSON store unreadable (ENOENT / corrupt): fall through to the .log file.
  }

  const fullText = await readLogFile(logFilePath);
  if (grepPattern !== null) {
    return grepLogFile(fullText, grepPattern, ignoreCase ? "1" : null, count);
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
        dashboardState.available &&
        dashboardState.distDir &&
        pathname.startsWith("/assets/")
      ) {
        const file = readDashboardAsset(dashboardState.distDir, pathname);
        if (file) {
          asset(res, 200, file.body, file.contentType);
        } else {
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

      // POST /api/favorites/scan -> scan a folder's top-level project manifests
      // (package.json / pyproject.toml / Cargo.toml) and return candidate
      // launch commands the dashboard can selectively import as favorites.
      // Stateless: the dashboard persists the user's picks in localStorage; the
      // backend never stores favorites.
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

      // /api/processes[/:id[/action]]
      const apiMatch = pathname.match(
        /^\/api\/processes(?:\/([^/]+))?(?:\/(stop|restart|logs|log-files|log-download|command))?$/,
      );
      if (apiMatch) {
        const [, idParam, action] = apiMatch;

        // GET /api/processes
        if (method === "GET" && !idParam) {
          // Merge live + historical (stopped/exited) records so expired
          // processes remain visible across restarts.
          const records = await listProcessRecords();
          json(res, 200, {
            serverId,
            pid: process.pid,
            processes: records.map(toPublicRecord),
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
          const args: string[] = Array.isArray(body.args)
            ? body.args.map(String)
            : [];
          const envs: Record<string, string> =
            body.envs && typeof body.envs === "object" && !Array.isArray(body.envs)
              ? body.envs
              : {};
          const desc = body.desc ? String(body.desc) : undefined;
          const processId = generateProcessId();
          const started = await startProcess(
            processId,
            script,
            name,
            args,
            cwd,
            envs,
            desc,
          );
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
          if (method !== "GET") {
            json(res, 405, { error: "Method not allowed" });
            return;
          }
          const rp = await resolveProcess(idParam);
          if (!rp) {
            json(res, 404, { error: "Process not found" });
            return;
          }
          const stream = (url.searchParams.get("stream") || "stdout") as
            | "stdout"
            | "stderr";
          const count = Number(url.searchParams.get("count") || "200");

          // Stopped/expired process: no in-memory client, so serve logs from
          // disk. Prefer the sibling lowdb `.json` store (one timestamped
          // record per line, correct & separated) — recover it by swapping the
          // persisted `.log` path's extension. Fall back to the raw `.log`
          // text file when the JSON store is unreadable (e.g. a record from a
          // previous backend session whose tmp dir is gone). The JSON path
          // yields `[ISO] message` lines matching the live format; the `.log`
          // fallback has no timestamps (frontend falls back to "now").
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

            const text = await readRecordLogText(
              textFilePath,
              grepPattern,
              ignoreCase,
              count,
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
            let regex: RegExp;
            try {
              regex = new RegExp(grepPattern, ignoreCase ? "i" : "");
            } catch (e) {
              json(res, 400, { error: `Invalid regex: ${toErrorMessage(e)}` });
              return;
            }
            const chunks = await client.search(regex, count);
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
  const token = process.env.PROCM_HTTP_TOKEN;
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
      // Attach the WebSocket endpoint on the same server/port so the dashboard
      // can receive real-time process + log updates instead of polling.
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
