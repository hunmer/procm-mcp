import assert from "node:assert/strict";
import { createProcmClient, executeCustom } from "@procm-mcp/sdk";

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

  const uiValue = await executeCustom(
    client,
    "frontend",
    (context, selector) => context.getUiValue(selector),
    ["#ui-value"],
  );
  assert.equal(uiValue, "electron-demo-value");
  console.log(JSON.stringify({ ok: true, backend, uiValue }, null, 2));
} finally {
  client.close();
}
