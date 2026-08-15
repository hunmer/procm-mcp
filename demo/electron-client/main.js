import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHook, createLogger, createProcmClient, exposeCustomExecution, getTrace, PROCM_LOG_TOPIC } from "@procm-mcp/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
// PROCM_DEMO_WS_URL wins over PROCM_WS_URL on purpose: the process manager
// injects its own room URL into PROCM_WS_URL, which would otherwise override
// the explicit envs from procm-commands.json.
const client = createProcmClient({ clientName: "electron", url: process.env.PROCM_DEMO_WS_URL || undefined });
const logger = createLogger({ client });
let window = null;
let stopCustomExecution = null;

function emit(channel, value) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value);
}

client.onState((state) => {
  emit("procm:state", state);
  if (state === "open") {
    stopCustomExecution ??= exposeCustomExecution(client, {
      target: "frontend",
      context: {
        getUiValue: async (selector) => {
          if (!window || window.isDestroyed()) throw new Error("Electron window is not ready");
          return window.webContents.executeJavaScript(
            `document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`,
            true,
          );
        },
        getRendererData: async () => {
          if (!window || window.isDestroyed()) throw new Error("Electron window is not ready");
          return window.webContents.executeJavaScript(`(() => {
            const value = (selector) => document.querySelector(selector)?.textContent ?? null;
            return {
              identity: value("#identity"),
              status: value("#status"),
              backend: value("#backend"),
              roundtrips: value("#roundtrips"),
              members: value("#members"),
              uiValue: value("#ui-value"),
            };
          })()`, true);
        },
      },
    });
  } else if (stopCustomExecution) {
    stopCustomExecution();
    stopCustomExecution = null;
  }
});
client.onMember((event, member) => emit("procm:member", { event, member }));
client.subscribe("backend:pong", (message) => emit("procm:message", message));
client.subscribe(PROCM_LOG_TOPIC, (message) => emit("procm:log", message.payload));

// Hook + Trace demo: every call of renderBanner produces a FunctionTrace that
// the SDK submits to the room backend, keyed by the traceId reported to the UI.
let hookTraceState = null;
const renderBanner = createHook(
  async (lines) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    return lines.map((line) => line.toUpperCase());
  },
  {
    name: "electronRenderBanner",
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
renderBanner.before((ctx) => logger.info("Hook before renderBanner", { args: ctx.args }, { traceId: ctx.traceId }));
renderBanner.after((ctx) => logger.info("Hook after renderBanner", { status: ctx.error ? "threw" : "ok" }, { traceId: ctx.traceId }));

// The SDK reads the stored trace back through the backend's MCP endpoint.
async function fetchTraceDetail(traceId) {
  try {
    return await getTrace(client, traceId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

ipcMain.handle("procm:snapshot", () => ({ state: client.connectionState, roomId: client.roomId, memberId: client.memberId }));
ipcMain.handle("procm:wait-ready", async () => (await client.waitFor("backend:ready", { timeout: 15_000 })).payload);
ipcMain.handle("procm:ping", (_event, payload, correlationId) => client.publish("backend:ping", payload, { correlationId }));
ipcMain.handle("procm:sample-logs", () => client.publish("backend:log-sample", { requestedAt: Date.now() }));
ipcMain.handle("procm:frontend-log", (_event, data) => logger.info("Electron UI action", data));
ipcMain.handle("procm:hook-trace", async () => {
  const startedAt = Date.now();
  const result = await renderBanner(["hook", "trace", "demo"]);
  const deadline = Date.now() + 3_000;
  while (hookTraceState && !hookTraceState.stored && !hookTraceState.error && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const detail = await fetchTraceDetail(hookTraceState.traceId);
  return { trace: hookTraceState, result, elapsedMs: Date.now() - startedAt, detail };
});

app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: "#101114",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(here, "preload.cjs"),
    },
  });
  void window.loadFile(path.join(here, "index.html"));
});

app.on("window-all-closed", () => {
  client.close();
  app.quit();
});
