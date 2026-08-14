import { WebSocket } from "ws";
import { createHook, createProcmClient, saveTrace } from "@procm-mcp/sdk";
import {
  assert,
  assertEqual,
  mcpHttp,
  randomPort,
  runTest,
  sleep,
  startBackend,
  stopBackend,
  summarize,
} from "./_helpers.mjs";

const port = randomPort();
const backend = await startBackend({ port });
const client = createProcmClient({
  url: `ws://127.0.0.1:${port}/room`,
  roomId: "trace-room",
  memberId: "process-1:test",
  processId: "process-1",
  clientName: "test",
  reconnect: false,
});

function waitOpen(target, timeout = 5_000) {
  if (target.connectionState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("client open timeout")), timeout);
    const off = target.onState((state) => {
      if (state === "open") {
        clearTimeout(timer);
        off();
        resolve();
      }
    });
  });
}

async function getTrace(id) {
  const response = await mcpHttp(port, `trace-${Date.now()}-${Math.random()}`, "tools/call", {
    name: "trace-get",
    arguments: { id },
  });
  return JSON.parse(response.result.content[0].text);
}

async function waitForTrace(id, timeout = 3_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await getTrace(id);
    if (result.ok) return result.trace;
    await sleep(25);
  }
  throw new Error(`trace ${id} was not stored`);
}

function rawTraceFrame(frame) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/room`);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("raw trace timeout"));
    }, 5_000);
    socket.on("open", () => socket.send(JSON.stringify({
      version: 1,
      type: "hello",
      roomId: "trace-room",
      memberId: `raw:${Date.now()}:${Math.random()}`,
      clientName: "raw",
    })));
    socket.on("message", (chunk) => {
      const value = JSON.parse(chunk.toString());
      if (value.type === "welcome") socket.send(JSON.stringify(frame));
      if (value.type === "error" || value.type === "trace:stored") {
        clearTimeout(timer);
        socket.close();
        resolve(value);
      }
    });
    socket.on("error", reject);
  });
}

await runTest("SDK saves a versioned trace readable through HTTP Stream MCP", async () => {
  await waitOpen(client);
  const id = await saveTrace(client, { case: "basic", value: 42 });
  const result = await getTrace(id);
  assertEqual(result.ok, true, "trace-get succeeds in the same procm-mcp instance");
  assertEqual(result.trace.version, 1, "stored envelope is versioned");
  assertEqual(result.trace.traceId, id, "resolved ID matches stored trace ID");
  assertEqual(result.trace.roomId, "trace-room", "room identity is stored");
  assertEqual(result.trace.memberId, "process-1:test", "member identity is stored");
  assertEqual(result.trace.processId, "process-1", "process identity is stored");
  assertEqual(result.trace.data.value, 42, "payload is preserved");
});

await runTest("concurrent saves remain correlated without pending leaks", async () => {
  const values = Array.from({ length: 20 }, (_, index) => index);
  const ids = await Promise.all(values.map((index) => saveTrace(client, { index })));
  const rows = await Promise.all(ids.map((id) => getTrace(id)));
  assertEqual(new Set(ids).size, 20, "20 concurrent saves return unique IDs");
  assert(rows.every((row, index) => row.trace.data.index === index), "concurrent responses remain correlated");
  assertEqual(client.pendingTraceRequestCount, 0, "no pending request remains after concurrency");
});

await runTest("conflict, TTL, size, and server validation are enforced", async () => {
  const conflictId = `conflict_${Date.now()}`;
  await saveTrace(client, { version: 1 }, { id: conflictId });
  let conflictCode;
  try { await saveTrace(client, { version: 2 }, { id: conflictId }); } catch (error) { conflictCode = error.code; }
  assertEqual(conflictCode, "TRACE_STORE_CONFLICT", "explicit duplicate ID returns stable conflict code");
  assertEqual((await getTrace(conflictId)).trace.data.version, 1, "duplicate does not overwrite original data");

  const expiryId = await saveTrace(client, { expires: true }, { ttlSeconds: 1 });
  const deadline = Date.now() + 3_000;
  let expired;
  while (Date.now() < deadline) {
    expired = await getTrace(expiryId);
    if (!expired.ok) break;
    await sleep(25);
  }
  assertEqual(expired.error.code, "TRACE_NOT_FOUND", "expired trace is treated as missing");

  let oversized = false;
  try { await saveTrace(client, { text: "x".repeat(262_144) }); } catch (error) { oversized = error.message.includes("exceeds"); }
  assert(oversized, "SDK rejects oversized payload before sending");
  let badTtl = false;
  try { await saveTrace(client, { ok: true }, { ttlSeconds: 0 }); } catch { badTtl = true; }
  assert(badTtl, "SDK rejects invalid TTL before sending");

  const rawId = `raw_${Date.now()}`;
  const raw = await rawTraceFrame({
    version: 1,
    type: "trace:put",
    requestId: "raw-size",
    traceId: rawId,
    payload: { text: "x".repeat(262_144) },
  });
  assertEqual(raw.code, "TRACE_INVALID_PAYLOAD", "server independently rejects oversized payload");
  assertEqual((await getTrace(rawId)).error.code, "TRACE_NOT_FOUND", "server rejection leaves no cache entry");

  const rawTtl = await rawTraceFrame({
    version: 1,
    type: "trace:put",
    requestId: "raw-ttl",
    traceId: `rawttl_${Date.now()}`,
    ttlSeconds: 0,
    payload: { ok: true },
  });
  assertEqual(rawTtl.code, "TRACE_INVALID_PAYLOAD", "server independently rejects invalid TTL");
});

await runTest("trace-get returns stable missing and invalid ID errors", async () => {
  assertEqual((await getTrace(`missing_${Date.now()}`)).error.code, "TRACE_NOT_FOUND", "missing ID returns stable code");
  assertEqual((await getTrace("bad id!")).error.code, "TRACE_INVALID_ID", "invalid ID returns stable code");
});

await runTest("function hooks store returned, resolved, and rejected traces", async () => {
  const storedIds = [];
  const storeErrors = [];
  const options = {
    client,
    captureArgs: true,
    captureResult: true,
    onStored: (id) => storedIds.push(id),
    onStoreError: (error) => storeErrors.push(error),
  };
  const sync = createHook((value) => value + 1, { ...options, name: "sync" });
  assertEqual(sync(1), 2, "sync hook returns without waiting for storage");
  await createHook(async () => "ok", { ...options, name: "async-ok" })();
  const expectedError = new Error("expected rejection");
  try {
    await createHook(async () => { throw expectedError; }, { ...options, name: "async-fail" })();
  } catch (error) {
    assert(error === expectedError, "hook preserves rejection while storing trace");
  }
  const deadline = Date.now() + 3_000;
  while (storedIds.length < 3 && Date.now() < deadline) await sleep(25);
  const traces = await Promise.all(storedIds.map((id) => waitForTrace(id)));
  assertEqual(storedIds.length, 3, "all hook outcomes are stored");
  assert(traces.some((row) => row.data.name === "sync" && row.data.status === "returned"), "sync returned status is stored");
  assert(traces.some((row) => row.data.name === "async-ok" && row.data.status === "resolved"), "resolved status is stored");
  const rejected = traces.find((row) => row.data.name === "async-fail");
  assertEqual(rejected.data.status, "rejected", "rejected status is stored");
  assertEqual(rejected.data.error.message, "expected rejection", "error detail is stored");
  assertEqual(storeErrors.length, 0, "hook storage reports no background errors");
});

await runTest("saveTrace timeout and abort clean request waiters", async () => {
  function pendingClient() {
    const pending = new Map();
    return {
      connectionState: "open",
      requestTraceStore(requestId) {
        return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
      },
      cancelTraceStore(requestId, error) {
        const request = pending.get(requestId);
        if (!request) return;
        pending.delete(requestId);
        request.reject(error);
      },
      get pendingTraceRequestCount() { return pending.size; },
    };
  }

  const timeoutClient = pendingClient();
  let timeoutCode;
  try { await saveTrace(timeoutClient, { timeout: true }, { timeout: 10 }); } catch (error) { timeoutCode = error.code; }
  assertEqual(timeoutCode, "TRACE_REQUEST_TIMEOUT", "timeout returns stable error code");
  assertEqual(timeoutClient.pendingTraceRequestCount, 0, "timeout removes pending request");

  const abortClient = pendingClient();
  const controller = new AbortController();
  const request = saveTrace(abortClient, { abort: true }, { signal: controller.signal });
  controller.abort();
  let abortName;
  try { await request; } catch (error) { abortName = error.name; }
  assertEqual(abortName, "AbortError", "abort returns AbortError");
  assertEqual(abortClient.pendingTraceRequestCount, 0, "abort removes pending request");
});

client.close();
stopBackend(backend);
summarize();
