import { WebSocketServer, WebSocket } from "ws";
import type http from "http";
import {
  dashboardEvents,
  PROCESS_CHANGE,
  LOG_APPEND,
  type LogAppendPayload,
} from "./events.js";
import { listProcessRecords } from "./process-manager.js";
import type { ProcessRecord } from "./processes-repository.js";
import { serverLog } from "./server-log.js";

// Public process view — mirrors http-server's `toPublicRecord` (envs
// intentionally omitted, lifecycle timestamps included). Duplicated here to
// avoid a circular import back into http-server.
function toPublicView(p: ProcessRecord) {
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

// Attach a WebSocket server to an existing http.Server (same port). All
// dashboard clients receive the same full broadcast; per-client filtering is
// done in the browser. If `token` is set, connecting clients must present it
// as `?token=<token>` in the URL or `bearer.<token>` in the
// `sec-websocket-protocol` subprotocol — matching the REST auth model.
export function attachWebsocketServer(
  server: http.Server,
  token: string | undefined,
  opts: { serverId: string; pid: number; startedAt: number },
) {
  // Build the processes payload from the merged live+historical view so the
  // dashboard sees expired records too (consistent with GET /api/processes).
  const buildProcessesMessage = async (snapshot = false): Promise<string> => {
    const records = await listProcessRecords();
    const body: Record<string, unknown> = {
      type: "processes",
      serverId: opts.serverId,
      pid: opts.pid,
      startedAt: opts.startedAt,
      data: records.map(toPublicView),
    };
    if (snapshot) body.snapshot = true;
    return JSON.stringify(body);
  };

  const wss = new WebSocketServer({ noServer: true });

  // Hijack the HTTP 'upgrade' event so the WebSocket shares the same origin
  // and auth path as the REST API, rather than using ws's built-in server
  // integration (which would bypass our token check).
  server.on("upgrade", (req, socket, head) => {
    // Only handle the /ws path; anything else (e.g. HMR sockets in dev) is
    // left to other handlers / dropped. This also lets a dev proxy route
    // /ws -> backend while the SPA root stays on the Vite dev server.
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    if (!authorizeUpgrade(req, token)) {
      // Reject with a 401 so misconfigured clients see a clear reason.
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    serverLog("WebSocket dashboard client connected");
    // Serialize async process snapshots per connection. Lifecycle changes can
    // arrive while an earlier listProcessRecords() call is still reading the
    // store; without a queue, the older snapshot may resolve last and leave
    // the dashboard showing stale status/pid data.
    let processPush = Promise.resolve();
    const enqueueProcesses = (snapshot = false) => {
      processPush = processPush
        .then(() => buildProcessesMessage(snapshot))
        .then((msg) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(msg);
        })
        .catch((err) => {
          serverLog(`Failed to build WebSocket process snapshot: ${String(err)}`);
        });
    };

    // Send an immediate snapshot so the UI can render without an extra REST
    // round-trip on connect/reconnect.
    enqueueProcesses(true);

    const onProcessChange = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      enqueueProcesses();
    };
    const onLog = (payload: LogAppendPayload) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "log", ...payload }));
      }
    };

    dashboardEvents.on(PROCESS_CHANGE, onProcessChange);
    dashboardEvents.on(LOG_APPEND, onLog);

    const cleanup = () => {
      dashboardEvents.off(PROCESS_CHANGE, onProcessChange);
      dashboardEvents.off(LOG_APPEND, onLog);
    };
    ws.on("close", () => {
      serverLog("WebSocket dashboard client disconnected");
      cleanup();
    });
    ws.on("error", () => {
      // Swallow per-socket errors; cleanup happens in the close handler.
      cleanup();
    });
  });

  return wss;
}

// Validate a WebSocket upgrade request against the optional bearer token.
function authorizeUpgrade(
  req: http.IncomingMessage,
  token: string | undefined,
): boolean {
  if (!token) return true;

  // 1) ?token=<token> query string (browser-friendly; the native WebSocket
  //    API can't set arbitrary headers).
  const url = new URL(req.url || "/", "http://localhost");
  if (url.searchParams.get("token") === token) return true;

  // 2) Bearer token via the sec-websocket-protocol subprotocol trick, for
  //    clients that prefer not to put the token in the URL.
  const protocols = (req.headers["sec-websocket-protocol"] || "")
    .toString()
    .split(",")
    .map((s) => s.trim());
  if (protocols.includes(`bearer.${token}`)) return true;

  return false;
}
