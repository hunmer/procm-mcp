# Electron Integration

Connect from Electron main, not the renderer:

```ts
import { ipcMain } from "electron";
import { createProcmClient } from "@procm-mcp/sdk";

const client = createProcmClient({ clientName: "electron" });

ipcMain.handle("procm:wait-ready", async () => {
  return (await client.waitFor("backend:ready", { timeout: 15_000 })).payload;
});

ipcMain.handle("procm:ping", (_event, payload) => {
  return client.publish("backend:ping", payload);
});
```

Expose narrow preload methods:

```js
contextBridge.exposeInMainWorld("procm", {
  waitReady: () => ipcRenderer.invoke("procm:wait-ready"),
  ping: (payload) => ipcRenderer.invoke("procm:ping", payload),
});
```

Keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. Do not expose the WebSocket token, raw `ipcRenderer`, or arbitrary topic publishing unless the application requires it.

See the runnable [Electron main](../../../../demo/electron-client/main.js), [preload](../../../../demo/electron-client/preload.cjs), and [renderer](../../../../demo/electron-client/renderer.js).
