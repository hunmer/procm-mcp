import http from "node:http";
import { readFile } from "node:fs/promises";
import { createLogger, createProcmClient, executeCustom, exposeCustomExecution } from "@procm-mcp/sdk";

const port = Number(process.env.PORT || 4444);
const indexHtml = await readFile(new URL("./public/index.html", import.meta.url));
const client = createProcmClient({ clientName: "backend" });
const logger = createLogger({ client });
let stopCustomExecution = null;

client.subscribe("backend:ping", (message) => {
  logger.info("Ping request received", { from: message.memberId, payload: message.payload });
  client.publish("backend:pong", {
    request: message.payload,
    serverTime: new Date().toISOString(),
    pid: process.pid,
  });
});

client.subscribe("backend:log-sample", () => {
  logger.debug("Cache lookup completed", { key: "demo:user:42", hit: true, elapsedMs: 3 });
  logger.info("Profile loaded", { user: { id: 42, role: "developer" }, features: ["rooms", "waitFor"] });
  logger.warn("Demo warning", { retryInMs: 1500, recoverable: true });
  logger.error("Synthetic demo error", { code: "DEMO_ONLY", stack: ["handler", "demo"] });
});

client.onState((state) => {
  if (state === "open") {
    stopCustomExecution ??= exposeCustomExecution(client, {
      target: "backend",
      context: {
        getServerData: () => ({ port, pid: process.pid, roomId: client.roomId }),
      },
    });
    client.publish("backend:ready", { port, pid: process.pid, initializedAt: Date.now() }, { retain: true });
    logger.info("Backend initialized", { port, roomId: client.roomId });
  } else if (stopCustomExecution) {
    stopCustomExecution();
    stopCustomExecution = null;
  }
});

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`).pathname;
  if (req.method === "GET" && pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(indexHtml);
    return;
  }
  if (req.method === "GET" && pathname === "/api/snapshot") {
    sendJson(res, 200, {
      ok: true,
      state: client.connectionState,
      roomId: client.roomId,
      memberId: client.memberId,
      pid: process.pid,
    });
    return;
  }
  if (req.method === "GET" && pathname === "/api/electron-data") {
    if (client.connectionState !== "open") {
      sendJson(res, 503, { ok: false, error: "Backend SDK is not connected" });
      return;
    }
    try {
      const electron = await executeCustom(
        client,
        "frontend",
        async (context) => {
          if (typeof context.getRendererData === "function") return context.getRendererData();
          const selectors = ["#identity", "#status", "#backend", "#roundtrips", "#members", "#ui-value"];
          const values = await Promise.all(selectors.map((selector) => context.getUiValue(selector)));
          return {
            identity: values[0],
            status: values[1],
            backend: values[2],
            roundtrips: values[3],
            members: values[4],
            uiValue: values[5],
          };
        },
        [],
        { timeout: 5_000 },
      );
      sendJson(res, 200, { ok: true, electron });
    } catch (error) {
      sendJson(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  sendJson(res, 404, { ok: false, error: "Not found" });
});

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

server.listen(port, "127.0.0.1", () => logger.info("HTTP server listening", { port }));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    logger.info("Backend shutting down", { signal });
    client.close();
    server.close(() => process.exit(0));
  });
}
