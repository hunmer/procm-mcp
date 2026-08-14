import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger, createProcmClient, exposeCustomExecution, PROCM_LOG_TOPIC } from "@procm-mcp/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const client = createProcmClient({ clientName: "electron" });
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

ipcMain.handle("procm:snapshot", () => ({ state: client.connectionState, roomId: client.roomId, memberId: client.memberId }));
ipcMain.handle("procm:wait-ready", async () => (await client.waitFor("backend:ready", { timeout: 15_000 })).payload);
ipcMain.handle("procm:ping", (_event, payload) => client.publish("backend:ping", payload));
ipcMain.handle("procm:sample-logs", () => client.publish("backend:log-sample", { requestedAt: Date.now() }));
ipcMain.handle("procm:frontend-log", (_event, data) => logger.info("Electron UI action", data));

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
