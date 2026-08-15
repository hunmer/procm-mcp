import { WebSocketServer, WebSocket } from "ws";
import type http from "http";
import {
  dashboardEvents,
  LOG_APPEND,
  type LogAppendPayload,
} from "./events.js";
import { serverLog } from "./server-log.js";
import { attachRoomSocket } from "./room-hub.js";

// Attach a WebSocket server to an existing http.Server (same port). All
// dashboard clients receive the same full broadcast; per-client filtering is
// done in the browser. If `token` is set, connecting clients must present it
// as `?token=<token>` in the URL or `bearer.<token>` in the
// `sec-websocket-protocol` subprotocol — matching the REST auth model.
export function attachWebsocketServer(
  server: http.Server,
  token: string | undefined,
) {
  const wss = new WebSocketServer({ noServer: true });
  const roomWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  // Hijack the HTTP 'upgrade' event so the WebSocket shares the same origin
  // and auth path as the REST API, rather than using ws's built-in server
  // integration (which would bypass our token check).
  server.on("upgrade", (req, socket, head) => {
    // Only handle the /ws path; anything else (e.g. HMR sockets in dev) is
    // left to other handlers / dropped. This also lets a dev proxy route
    // /ws -> backend while the SPA root stays on the Vite dev server.
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== "/ws" && url.pathname !== "/room") {
      socket.destroy();
      return;
    }

    if (!authorizeUpgrade(req, token)) {
      // Reject with a 401 so misconfigured clients see a clear reason.
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    const target = url.pathname === "/room" ? roomWss : wss;
    target.handleUpgrade(req, socket, head, (ws) => target.emit("connection", ws, req));
  });

  roomWss.on("connection", (ws) => {
    serverLog("WebSocket room client connected");
    attachRoomSocket(ws);
  });

  wss.on("connection", (ws) => {
    serverLog("WebSocket dashboard client connected");
    const onLog = (payload: LogAppendPayload) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "log", ...payload }));
      }
    };

    dashboardEvents.on(LOG_APPEND, onLog);

    const cleanup = () => {
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
