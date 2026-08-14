import { createClient } from "redis";
import { WebSocket } from "ws";
import { createHook, createProcmClient, saveTrace } from "@procm-mcp/sdk";
import {
  assert,
  assertEqual,
  mcpCalls,
  mcpHttp,
  randomPort,
  runTest,
  sleep,
  startBackend,
  stopBackend,
  summarize,
} from "./_helpers.mjs";

const redisUrl = process.env.PROCM_REDIS_URL;
if (!redisUrl) throw new Error('PROCM_REDIS_URL is required; start Redis and run with PROCM_REDIS_URL="redis://127.0.0.1:16379/15"');

const redis = createClient({ url: redisUrl });
redis.on("error", () => {});
await redis.connect();
const createdKeys = new Set();
let backend;
let client;
let port;

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

async function stored(id) {
  const key = `procm:trace:v1:${id}`;
  createdKeys.add(key);
  const value = await redis.get(key);
  return value ? JSON.parse(value) : null;
}

async function waitForStored(id, timeout = 3_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await stored(id);
    if (value) return value;
    await sleep(25);
  }
  throw new Error(`trace ${id} was not stored`);
}

function rawTraceFrame(url, frame) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => { socket.terminate(); reject(new Error("raw trace timeout")); }, 5_000);
    socket.on("open", () => socket.send(JSON.stringify({
      version: 1,
      type: "hello",
      roomId: "trace-room",
      memberId: `raw:${Date.now()}`,
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

await runTest("backend and SDK connect with optional Redis", async () => {
  port = randomPort();
  backend = await startBackend({ port, env: { PROCM_REDIS_URL: redisUrl } });
  client = createProcmClient({
    url: `ws://127.0.0.1:${port}/room`,
    roomId: "trace-room",
    memberId: "process-1:test",
    processId: "process-1",
    clientName: "test",
    reconnect: false,
  });
  await waitOpen(client);
  assertEqual(client.connectionState, "open", "SDK room connection opens");
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

await runTest("saveTrace confirms versioned envelope, identity, TTL, and concurrency", async () => {
  const id = await saveTrace(client, { case: "basic", value: 42 });
  const envelope = await waitForStored(id);
  assertEqual(envelope.version, 1, "stored envelope is versioned");
  assertEqual(envelope.traceId, id, "resolved ID matches stored trace ID");
  assertEqual(envelope.roomId, "trace-room", "room identity is stored");
  assertEqual(envelope.memberId, "process-1:test", "member identity is stored");
  assertEqual(envelope.processId, "process-1", "process identity is stored");
  assertEqual(envelope.data.value, 42, "payload is preserved");
  const ttl = await redis.ttl(`procm:trace:v1:${id}`);
  assert(ttl >= 86_398 && ttl <= 86_400, "default TTL is 86400 seconds within tolerance");

  const values = Array.from({ length: 20 }, (_, index) => index);
  const ids = await Promise.all(values.map((index) => saveTrace(client, { index })));
  const rows = await Promise.all(ids.map((traceId) => waitForStored(traceId)));
  ids.forEach((traceId) => createdKeys.add(`procm:trace:v1:${traceId}`));
  assertEqual(new Set(ids).size, 20, "20 concurrent saves return unique IDs");
  assert(rows.every((row, index) => row.data.index === index), "concurrent responses remain correlated");
  assertEqual(client.pendingTraceRequestCount, 0, "no pending request remains after concurrency");
});

await runTest("conflict, TTL expiry, size, and server validation are enforced", async () => {
  const conflictId = `conflict_${Date.now()}`;
  createdKeys.add(`procm:trace:v1:${conflictId}`);
  await saveTrace(client, { version: 1 }, { id: conflictId });
  let conflictCode;
  try { await saveTrace(client, { version: 2 }, { id: conflictId }); } catch (error) { conflictCode = error.code; }
  assertEqual(conflictCode, "TRACE_STORE_CONFLICT", "explicit duplicate ID returns stable conflict code");
  assertEqual((await stored(conflictId)).data.version, 1, "duplicate does not overwrite original data");

  const expiryId = await saveTrace(client, { expires: true }, { ttlSeconds: 1 });
  createdKeys.add(`procm:trace:v1:${expiryId}`);
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline && await redis.exists(`procm:trace:v1:${expiryId}`)) await sleep(50);
  assertEqual(await redis.exists(`procm:trace:v1:${expiryId}`), 0, "custom TTL expires without fixed sleep");

  let oversized = false;
  try { await saveTrace(client, { text: "x".repeat(262_144) }); } catch (error) { oversized = error.message.includes("exceeds"); }
  assert(oversized, "SDK rejects oversized payload before sending");
  let badTtl = false;
  try { await saveTrace(client, { ok: true }, { ttlSeconds: 0 }); } catch { badTtl = true; }
  assert(badTtl, "SDK rejects invalid TTL before sending");

  const rawId = `raw_${Date.now()}`;
  const raw = await rawTraceFrame(`ws://127.0.0.1:${port}/room`, {
    version: 1, type: "trace:put", requestId: "raw-size", traceId: rawId,
    payload: { text: "x".repeat(262_144) },
  });
  assertEqual(raw.code, "TRACE_INVALID_PAYLOAD", "server independently rejects oversized payload");
  assertEqual(await redis.exists(`procm:trace:v1:${rawId}`), 0, "server rejection leaves no Redis key");

  const rawTtl = await rawTraceFrame(`ws://127.0.0.1:${port}/room`, {
    version: 1, type: "trace:put", requestId: "raw-ttl", traceId: `rawttl_${Date.now()}`,
    ttlSeconds: 0, payload: { ok: true },
  });
  assertEqual(rawTtl.code, "TRACE_INVALID_PAYLOAD", "server independently rejects invalid TTL");
});

await runTest("trace-get works over HTTP and stdio with stable errors", async () => {
  const id = await saveTrace(client, { source: "mcp" });
  createdKeys.add(`procm:trace:v1:${id}`);
  const httpResponse = await mcpHttp(port, "trace-http", "tools/call", { name: "trace-get", arguments: { id } });
  const httpBody = JSON.parse(httpResponse.result.content[0].text);
  assertEqual(httpBody.ok, true, "HTTP trace-get succeeds");
  assertEqual(httpBody.trace.data.source, "mcp", "HTTP returns complete trace");

  const stdio = await mcpCalls([{
    jsonrpc: "2.0", id: "trace-stdio", method: "tools/call",
    params: { name: "trace-get", arguments: { id } },
  }], { env: { PROCM_REDIS_URL: redisUrl } });
  const stdioBody = JSON.parse(stdio["trace-stdio"].result.content[0].text);
  assertEqual(stdioBody.trace.traceId, id, "stdio reads the same Redis record");

  const missingResponse = await mcpHttp(port, "trace-missing", "tools/call", { name: "trace-get", arguments: { id: `missing_${Date.now()}` } });
  assertEqual(JSON.parse(missingResponse.result.content[0].text).error.code, "TRACE_NOT_FOUND", "missing ID returns stable code");
  const invalidResponse = await mcpHttp(port, "trace-invalid", "tools/call", { name: "trace-get", arguments: { id: "bad id!" } });
  assertEqual(JSON.parse(invalidResponse.result.content[0].text).error.code, "TRACE_INVALID_ID", "invalid ID returns stable code");
});

await runTest("function hooks store returned, resolved, and rejected traces asynchronously", async () => {
  const storedIds = [];
  const waiters = [];
  const storeErrors = [];
  const options = {
    client,
    captureArgs: true,
    captureResult: true,
    onTraceCreated: (id) => createdKeys.add(`procm:trace:v1:${id}`),
    onStored: (id) => storedIds.push(id),
    onStoreError: (error) => storeErrors.push(error),
  };
  const sync = createHook((value) => value + 1, { ...options, name: "sync" });
  const syncResult = sync(1);
  assertEqual(syncResult, 2, "sync hook returns before storage confirmation");
  const asyncOk = createHook(async () => "ok", { ...options, name: "async-ok" });
  await asyncOk();
  const expectedError = new Error("expected rejection");
  const asyncFail = createHook(async () => { throw expectedError; }, { ...options, name: "async-fail" });
  try { await asyncFail(); } catch (error) { assert(error === expectedError, "hook preserves rejection while storing trace"); }
  const deadline = Date.now() + 3_000;
  while (storedIds.length < 3 && Date.now() < deadline) await sleep(25);
  for (const id of storedIds) waiters.push(waitForStored(id));
  const traces = await Promise.all(waiters);
  assertEqual(storedIds.length, 3, "all hook outcomes are stored");
  assert(traces.some((row) => row.data.name === "sync" && row.data.status === "returned"), "sync returned status is stored");
  assert(traces.some((row) => row.data.name === "async-ok" && row.data.status === "resolved"), "resolved status is stored");
  const rejected = traces.find((row) => row.data.name === "async-fail");
  assertEqual(rejected.data.status, "rejected", "rejected status is stored");
  assertEqual(rejected.data.error.message, "expected rejection", "error detail is stored");
  assert(!JSON.stringify(rejected).includes(redisUrl), "trace does not contain Redis credentials");
  assertEqual(storeErrors.length, 0, "hook storage reports no background errors");
});

await runTest("Redis absence and outage do not block backend startup", async () => {
  const noRedisPort = randomPort();
  const noRedis = await startBackend({ port: noRedisPort, env: { PROCM_REDIS_URL: "" } });
  const noRedisClient = createProcmClient({ url: `ws://127.0.0.1:${noRedisPort}/room`, roomId: "no-redis", reconnect: false });
  try {
    await waitOpen(noRedisClient);
    let code;
    try { await saveTrace(noRedisClient, { ok: true }); } catch (error) { code = error.code; }
    assertEqual(code, "TRACE_REDIS_NOT_CONFIGURED", "save fails clearly when Redis is not configured");
    const read = await mcpHttp(noRedisPort, "no-redis", "tools/call", { name: "trace-get", arguments: { id: "valid-id" } });
    assertEqual(JSON.parse(read.result.content[0].text).error.code, "TRACE_REDIS_NOT_CONFIGURED", "read fails clearly when Redis is not configured");
  } finally {
    noRedisClient.close();
    stopBackend(noRedis);
  }

  const unavailablePort = randomPort();
  const unavailable = await startBackend({ port: unavailablePort, env: { PROCM_REDIS_URL: "redis://127.0.0.1:1/15" } });
  const unavailableClient = createProcmClient({ url: `ws://127.0.0.1:${unavailablePort}/room`, roomId: "bad-redis", reconnect: false });
  try {
    await waitOpen(unavailableClient);
    let code;
    try { await saveTrace(unavailableClient, { ok: true }, { timeout: 3_000 }); } catch (error) { code = error.code; }
    assertEqual(code, "TRACE_REDIS_UNAVAILABLE", "save fails clearly when Redis is unavailable");
    assertEqual(unavailableClient.pendingTraceRequestCount, 0, "failed save cleans pending request");
  } finally {
    unavailableClient.close();
    stopBackend(unavailable);
  }
});

try {
  client?.close();
  stopBackend(backend);
  if (createdKeys.size) await redis.del([...createdKeys]);
  await redis.close();
} finally {
  summarize();
}
