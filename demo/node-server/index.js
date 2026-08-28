import http from "node:http";
import { readFile } from "node:fs/promises";
import {
  createHook,
  createLogger,
  createProcmClient,
  decodeStructuredLogLine,
  executeCustom,
  exposeCustomExecution,
  getTrace,
} from "@hunmer/procm-mcp-sdk";

const port = Number(process.env.PORT || 4444);
const indexHtml = await readFile(new URL("./public/index.html", import.meta.url));
// PROCM_DEMO_WS_URL wins over PROCM_WS_URL on purpose: the process manager
// injects its own room URL into PROCM_WS_URL, which would otherwise override
// the explicit envs from procm-commands.json.
const client = createProcmClient({ clientName: "backend", url: process.env.PROCM_DEMO_WS_URL || undefined });

// Keep an in-memory log tail (bounded) for the console page. The page polls
// /api/logs incrementally by sequence number, so records already fetched are
// never dropped or cleared on the client.
const MAX_LOG_ENTRIES = 500;
const logBuffer = [];
let logSeq = 0;
function appendLog(level, line) {
  const entry = decodeStructuredLogLine(line) ?? { timestamp: Date.now(), level, message: line };
  logBuffer.push({ seq: ++logSeq, ...entry });
  if (logBuffer.length > MAX_LOG_ENTRIES) logBuffer.splice(0, logBuffer.length - MAX_LOG_ENTRIES);
}
const consoleSink = {};
for (const level of ["debug", "info", "warn", "error"]) {
  consoleSink[level] = (line) => {
    console[level](line);
    appendLog(level, line);
  };
}
const logger = createLogger({ client, console: consoleSink });
let stopCustomExecution = null;

client.subscribe("backend:ping", (message) => {
  logger.info("Ping request received", { from: message.memberId, payload: message.payload });
  client.publish("backend:pong", {
    request: message.payload,
    serverTime: new Date().toISOString(),
    pid: process.pid,
  }, { correlationId: message.correlationId });
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

// Hook + Trace demo: every call of priceInventory produces a FunctionTrace that
// the SDK submits to the room backend, keyed by the traceId reported below.
let hookTraceState = null;
const priceInventory = createHook(
  async (items) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return items.map((item) => ({ sku: item.sku, total: item.qty * 10 }));
  },
  {
    name: "priceInventory",
    client,
    onTraceCreated(traceId) {
      hookTraceState = { traceId, stored: false };
    },
    onStored(traceId) {
      if (hookTraceState?.traceId === traceId) hookTraceState.stored = true;
    },
    onStoreError(error, traceId) {
      if (hookTraceState?.traceId === traceId) hookTraceState.error = error.message;
    },
  },
);
priceInventory.before((ctx) => logger.info("Hook before priceInventory", { args: ctx.args }, { traceId: ctx.traceId }));
priceInventory.after((ctx) => logger.info("Hook after priceInventory", { status: ctx.error ? "threw" : "ok" }, { traceId: ctx.traceId }));

async function runHookTraceSample() {
  const startedAt = Date.now();
  const result = await priceInventory([{ sku: "SDK-1", qty: 2 }, { sku: "HOOK-9", qty: 1 }]);
  const deadline = Date.now() + 3_000;
  while (hookTraceState && !hookTraceState.stored && !hookTraceState.error && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { trace: hookTraceState, result, elapsedMs: Date.now() - startedAt };
}

// The SDK reads the stored trace back through the backend's MCP endpoint.
async function fetchTraceDetail(traceId) {
  try {
    return await getTrace(client, traceId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = url.pathname;
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
  if (req.method === "GET" && pathname === "/api/logs") {
    const after = Number(url.searchParams.get("after") ?? 0) || 0;
    sendJson(res, 200, { ok: true, logs: logBuffer.filter((entry) => entry.seq > after) });
    return;
  }
  if (req.method === "GET" && pathname === "/api/hook-trace") {
    try {
      const sample = await runHookTraceSample();
      sendJson(res, 200, { ok: true, ...sample, detail: await fetchTraceDetail(sample.trace.traceId) });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
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
