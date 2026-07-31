import http from "http";
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
  startProcess,
  removeProcess,
  deleteProcess,
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

// Build the request handler. Shared by both modes (MCP+HTTP and HTTP-only).
function createRequestHandler(token: string | undefined) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");

      // Auth check applies to everything.
      if (token) {
        const auth = req.headers["authorization"] || "";
        const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (provided !== token) {
          json(res, 401, { error: "Unauthorized" });
          return;
        }
      }

      const method = req.method || "GET";
      const pathname = url.pathname;

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

      // /api/processes[/:id[/action]]
      const apiMatch = pathname.match(
        /^\/api\/processes(?:\/([^/]+))?(?:\/(stop|restart|logs))?$/,
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
          // NOTE: human-driven dashboard start intentionally bypasses allow-x.
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

        if (!idParam) {
          json(res, 404, { error: "Not found" });
          return;
        }

        if (action === "logs") {
          if (method !== "GET") {
            json(res, 405, { error: "Method not allowed" });
            return;
          }
          const meta = getProcess(idParam);
          if (!meta) {
            json(res, 404, { error: "Process not found" });
            return;
          }
          const stream = (url.searchParams.get("stream") || "stdout") as
            | "stdout"
            | "stderr";
          const count = Number(url.searchParams.get("count") || "200");
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
