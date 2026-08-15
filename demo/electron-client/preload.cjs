const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("procm", {
  snapshot: () => ipcRenderer.invoke("procm:snapshot"),
  waitReady: () => ipcRenderer.invoke("procm:wait-ready"),
  ping: (payload, correlationId) => ipcRenderer.invoke("procm:ping", payload, correlationId),
  sampleLogs: () => ipcRenderer.invoke("procm:sample-logs"),
  hookTrace: () => ipcRenderer.invoke("procm:hook-trace"),
  frontendLog: (data) => ipcRenderer.invoke("procm:frontend-log", data),
  onState: (callback) => ipcRenderer.on("procm:state", (_event, value) => callback(value)),
  onMember: (callback) => ipcRenderer.on("procm:member", (_event, value) => callback(value)),
  onMessage: (callback) => ipcRenderer.on("procm:message", (_event, value) => callback(value)),
  onLog: (callback) => ipcRenderer.on("procm:log", (_event, value) => callback(value)),
});
