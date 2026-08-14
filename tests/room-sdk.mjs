import { createProcmClient, executeCustom, exposeCustomExecution } from "@procm-mcp/sdk";
import {
  assert,
  assertEqual,
  http,
  mcpCalls,
  projectRoot,
  randomPort,
  runTest,
  sleep,
  startBackend,
  stopBackend,
  summarize,
} from "./_helpers.mjs";

function waitOpen(client, timeout = 5000) {
  if (client.connectionState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("client open timeout")), timeout);
    const off = client.onState((state) => {
      if (state === "open") {
        clearTimeout(timer);
        off();
        resolve();
      }
    });
  });
}

await runTest("room SDK forwarding, prefix subscriptions, and retained waitFor", async () => {
  const port = randomPort();
  const backend = await startBackend({ port });
  const url = `ws://127.0.0.1:${port}/room`;
  const publisher = createProcmClient({ url, roomId: "test-room", clientName: "publisher", reconnect: false });
  const subscriber = createProcmClient({ url, roomId: "test-room", clientName: "subscriber", reconnect: false });
  try {
    await Promise.all([waitOpen(publisher), waitOpen(subscriber)]);
    const received = [];
    subscriber.subscribe("debug:", (message) => received.push(message), { prefix: true });
    await sleep(50);
    publisher.publish("debug:result", { ok: true, value: 42 });
    for (let i = 0; i < 20 && received.length === 0; i++) await sleep(25);
    assertEqual(received[0]?.payload?.value, 42, "prefix subscriber receives forwarded payload");

    publisher.publish("backend:ready", { initialized: true }, { retain: true });
    const late = createProcmClient({ url, roomId: "test-room", clientName: "late", reconnect: false });
    try {
      const ready = await late.waitFor("backend:ready", { timeout: 3000 });
      assertEqual(ready.payload.initialized, true, "late waitFor resolves from retained state");
    } finally {
      late.close();
    }
    const rooms = await http(port, "GET", "/api/rooms");
    assert(rooms.data.rooms.some((room) => room.id === "test-room"), "room appears in HTTP list");
  } finally {
    publisher.close();
    subscriber.close();
    stopBackend(backend);
  }
});

await runTest("custom execution is gated by connection and can query backend and simulated UI data", async () => {
  const disconnected = createProcmClient({
    url: "ws://127.0.0.1:1/room",
    roomId: "custom-execution-gate",
    reconnect: false,
  });
  try {
    let rejected = false;
    try {
      exposeCustomExecution(disconnected);
    } catch (error) {
      rejected = String(error).includes("only be exposed after");
    }
    assert(rejected, "custom execution cannot be exposed before the SDK connection opens");
  } finally {
    disconnected.close();
  }

  const port = randomPort();
  const backend = await startBackend({ port });
  const url = `ws://127.0.0.1:${port}/room`;
  const requester = createProcmClient({ url, roomId: "execution-room", clientName: "test", reconnect: false });
  const backendTarget = createProcmClient({ url, roomId: "execution-room", clientName: "backend", reconnect: false });
  const frontendTarget = createProcmClient({ url, roomId: "execution-room", clientName: "frontend", reconnect: false });
  let stopBackendExecution;
  let stopFrontendExecution;
  try {
    await Promise.all([waitOpen(requester), waitOpen(backendTarget), waitOpen(frontendTarget)]);
    stopBackendExecution = exposeCustomExecution(backendTarget, {
      context: { getData: () => ({ source: "backend", value: 42 }) },
    });
    stopFrontendExecution = exposeCustomExecution(frontendTarget, {
      context: { getUiValue: (selector) => selector === "#mock-value" ? "frontend-ui-value" : null },
    });
    await sleep(50);

    const backendData = await executeCustom(requester, "backend", (context) => context.getData());
    assertEqual(backendData.value, 42, "custom execution returns backend data");
    const uiValue = await executeCustom(
      requester,
      "frontend",
      (context, selector) => context.getUiValue(selector),
      ["#mock-value"],
    );
    assertEqual(uiValue, "frontend-ui-value", "custom execution returns simulated frontend UI value");
  } finally {
    stopBackendExecution?.();
    stopFrontendExecution?.();
    requester.close();
    backendTarget.close();
    frontendTarget.close();
    stopBackend(backend);
  }
});

await runTest("process roomId survives restart and structured logs are queryable", async () => {
  const port = randomPort();
  const backend = await startBackend({ port });
  try {
    const source = `import('@procm-mcp/sdk').then(({createLogger})=>{createLogger({clientName:'fixture',memberId:'fixture:logger'}).info('fixture ready',{answer:42})})`;
    const started = await http(port, "POST", "/api/processes", {
      script: "node",
      args: ["-e", source],
      cwd: projectRoot,
      name: "room-log-fixture",
      roomId: "log-room",
    });
    assertEqual(started.status, 201, "room process starts");
    const id = started.data.id;
    await sleep(500);
    const before = await http(port, "GET", `/api/processes/${id}`);
    assertEqual(before.data.roomId, "log-room", "public process includes roomId");
    const restarted = await http(port, "POST", `/api/processes/${id}/restart`);
    assertEqual(restarted.status, 200, "room process restarts");
    const after = await http(port, "GET", `/api/processes/${id}`);
    assertEqual(after.data.roomId, "log-room", "restart preserves roomId");
    await sleep(500);
    const logs = await http(port, "GET", "/api/rooms/log-room/logs?memberPrefix=fixture&level=info&count=20");
    assertEqual(logs.status, 200, "room log query succeeds");
    assert(logs.data.entries.some((entry) => entry.message === "fixture ready" && entry.data?.answer === 42), "structured log data is decoded from existing log file");
  } finally {
    stopBackend(backend);
  }
});

await runTest("batch-process returns ordered per-item results", async () => {
  const results = await mcpCalls([{
    jsonrpc: "2.0",
    id: "batch",
    method: "tools/call",
    params: {
      name: "batch-process",
      arguments: {
        action: "start",
        concurrency: 2,
        processes: [
          { script: "node", args: ["-e", "setTimeout(()=>{},1000)"], cwd: projectRoot, name: "batch-ok", roomId: "batch-room" },
          { script: "definitely-not-a-real-command", cwd: projectRoot, name: "batch-fail", roomId: "batch-room" },
        ],
      },
    },
  }]);
  const text = results.batch?.result?.content?.[0]?.text ?? "";
  const body = JSON.parse(text);
  assertEqual(body.results.length, 2, "batch returns one result per input");
  assertEqual(body.results[0].ok, true, "first batch item succeeds");
  assertEqual(body.results[1].ok, false, "second batch item exposes failure");
});

summarize();
