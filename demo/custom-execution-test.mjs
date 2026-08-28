import assert from "node:assert/strict";
import { createProcmClient, executeCustom } from "@hunmer/procm-mcp-sdk";

const client = createProcmClient({ clientName: "custom-execution-test", reconnect: false });

function waitOpen(timeout = 5_000) {
  if (client.connectionState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("procm connection timed out")), timeout);
    const off = client.onState((state) => {
      if (state !== "open") return;
      clearTimeout(timer);
      off();
      resolve();
    });
  });
}

try {
  await waitOpen();
  const backend = await executeCustom(client, "backend", (context) => context.getServerData());
  assert.equal(backend.roomId, client.roomId);
  assert.equal(typeof backend.pid, "number");

  const baseUrl = `http://127.0.0.1:${process.env.PORT || 4444}`;
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /async function loadElectronData\(\)/);

  const response = await fetch(`${baseUrl}/api/electron-data`);
  const result = await response.json();
  assert.equal(response.status, 200, result.error);
  assert.equal(result.electron.uiValue, "electron-demo-value");
  console.log(JSON.stringify({ ok: true, backend, electron: result.electron }, null, 2));
} finally {
  client.close();
}
