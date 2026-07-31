import http from "http";
import { dashboardHtml } from "./dashboard-html.js";
import { serverLog, serverId } from "./server-log.js";
import {
  listProcesses,
  getProcess,
  startProcess,
  removeProcess,
  restartProcess,
  generateProcessId,
  validateScript,
  pushProcess,
} from "./process-manager.js";
import { toErrorMessage } from "./error.js";
import { ProcessMetadata } from "./types.js";

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

// Start the dashboard HTTP server if PROCM_HTTP_PORT is set.
// Bound to 127.0.0.1 only. If PROCM_HTTP_TOKEN is set, requests must carry
// `Authorization: Bearer <token>`.
export function startHttpServerIfConfigured(): http.Server | undefined {
  const portStr = process.env.PROCM_HTTP_PORT;
  if (!portStr) {
    return undefined;
  }
  const port = Number(portStr);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    serverLog(`Invalid PROCM_HTTP_PORT "${portStr}", HTTP dashboard disabled.`);
    return undefined;
  }
  const token = process.env.PROCM_HTTP_TOKEN;

  const server = http.createServer(async (req, res) => {
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

      // GET /  -> dashboard page
      if (method === "GET" && pathname === "/") {
        html(res, 200, dashboardHtml());
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
          json(res, 200, {
            serverId,
            pid: process.pid,
            processes: listProcesses().map(toPublicView),
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
          const processId = generateProcessId();
          // NOTE: human-driven dashboard start intentionally bypasses allow-x.
          const started = await startProcess(
            processId,
            script,
            name,
            args,
            cwd,
            envs,
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
  });

  server.listen(port, HOST, () => {
    serverLog(
      `Dashboard HTTP server listening on http://${HOST}:${port}` +
        (token ? " (token protected)" : ""),
    );
  });

  return server;
}
