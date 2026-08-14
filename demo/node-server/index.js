import http from "node:http";
import { createLogger, createProcmClient, exposeCustomExecution } from "@procm-mcp/sdk";

const port = Number(process.env.PORT || 4310);
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

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, roomId: client.roomId, pid: process.pid }));
});

server.listen(port, "127.0.0.1", () => logger.info("HTTP server listening", { port }));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    logger.info("Backend shutting down", { signal });
    client.close();
    server.close(() => process.exit(0));
  });
}
