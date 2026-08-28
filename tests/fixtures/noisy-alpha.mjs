import { createProcmClient, exposeCustomExecution } from "@hunmer/procm-mcp-sdk";

const target = "noisy-alpha";
const roomId = process.env.PROCM_ROOM_ID;
const url = process.env.PROCM_WS_URL;
if (!roomId || !url) throw new Error("PROCM_ROOM_ID and PROCM_WS_URL are required");

const client = createProcmClient({ url, roomId, clientName: target, reconnect: false });
let stopExecution;
let noiseTimer;

function waitOpen() {
  if (client.connectionState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("alpha SDK connection timeout")), 5000);
    const off = client.onState((state) => {
      if (state !== "open") return;
      clearTimeout(timeout);
      off();
      resolve();
    });
  });
}

async function main() {
  await waitOpen();
  stopExecution = exposeCustomExecution(client, {
    context: {
      add: (left, right) => ({ target, result: Number(left) + Number(right), noise: false }),
    },
  });
  noiseTimer = setInterval(() => {
    process.stdout.write(`ALPHA_NOISE ${Date.now()}\n`);
    process.stderr.write(`ALPHA_ERR_NOISE ${Date.now()}\n`);
  }, 10);
  process.stdout.write("ALPHA_READY\n");
}

function shutdown() {
  if (noiseTimer) clearInterval(noiseTimer);
  stopExecution?.();
  client.close();
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
main().catch((error) => {
  process.stderr.write(`ALPHA_START_ERROR ${error.message}\n`);
  shutdown();
  process.exitCode = 1;
});
