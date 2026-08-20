// End-to-end check against the managed test backend only. The backend must be
// started as the test-procm command on port 7332 before running this script.
import WebSocket from "ws";
import { clearLogs } from "../packages/procm-sdk/dist/rest.js";

const PORT = 7332;
const HTTP_BASE = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;
const TIMEOUT_MS = 8_000;

let processId;
let socket;
const messages = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(method, path, body) {
  const headers = {};
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${HTTP_BASE}${path}`, init);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${text}`);
  }
  return data;
}

async function waitFor(check, description) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function connectDashboardSocket() {
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`timed out connecting to ${WS_URL}`));
    }, TIMEOUT_MS);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function mcpCall(id, method, params) {
  const response = await fetch(`${HTTP_BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await response.text();
  assert(response.ok, `MCP ${method} failed (${response.status}): ${text}`);
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  assert(dataLine, `MCP ${method} returned no SSE data`);
  return JSON.parse(dataLine.slice(6));
}

async function initializeMcp() {
  const initialized = await mcpCall("log-clear-init", "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "log-clear-notification-test", version: "1.0" },
  });
  assert(initialized.result, "MCP initialize returned no result");
  await fetch(`${HTTP_BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
}

async function emitLogs(marker) {
  await request("POST", `/api/processes/${processId}/input`, { text: marker });
  await waitFor(async () => {
    const [stdout, stderr] = await Promise.all([
      request("GET", `/api/processes/${processId}/logs?stream=stdout&count=50`),
      request("GET", `/api/processes/${processId}/logs?stream=stderr&count=50`),
    ]);
    return stdout.text.includes(marker) && stderr.text.includes(marker);
  }, `both log streams to contain ${marker}`);
}

async function assertLogsEmpty() {
  const [stdout, stderr] = await Promise.all([
    request("GET", `/api/processes/${processId}/logs?stream=stdout&count=50`),
    request("GET", `/api/processes/${processId}/logs?stream=stderr&count=50`),
  ]);
  assert(stdout.text === "", `stdout was not cleared: ${stdout.text}`);
  assert(stderr.text === "", `stderr was not cleared: ${stderr.text}`);
}

async function waitForClearNotification(afterIndex) {
  return await waitFor(
    () => messages.slice(afterIndex).find(
      (message) => message.type === "logCleared" && message.processId === processId,
    ),
    `logCleared notification for ${processId}`,
  );
}

async function main() {
  const meta = await request("GET", "/api/meta");
  assert(meta.port === PORT, `refusing to test backend port ${String(meta.port)}; expected ${PORT}`);
  console.log(`OK: connected to test-procm on ${HTTP_BASE} (${meta.serverId})`);

  socket = await connectDashboardSocket();
  socket.on("message", (raw) => {
    try {
      messages.push(JSON.parse(raw.toString()));
    } catch {
      // Ignore malformed frames; the assertions below require valid messages.
    }
  });
  console.log("OK: dashboard WebSocket connected");

  const childCode = [
    "process.stdin.setEncoding('utf8')",
    "process.stdin.on('data', value => {",
    "  const marker = value.trim()",
    "  console.log(marker)",
    "  console.error(marker)",
    "})",
    "process.stdin.resume()",
  ].join(";");
  const started = await request("POST", "/api/processes", {
    script: process.execPath,
    args: ["-e", childCode],
    cwd: process.cwd(),
    name: `log-clear-notification-${Date.now()}`,
    group: "test",
  });
  processId = started.id;
  assert(processId, `test process did not return an id: ${JSON.stringify(started)}`);
  await waitFor(async () => {
    const process = await request("GET", `/api/processes/${processId}`);
    return process.status === "running";
  }, `test process ${processId} to run`);

  await emitLogs(`SDK_CLEAR_${Date.now()}`);
  const sdkMessageIndex = messages.length;
  const sdkResult = await clearLogs({
    processId,
    connectionTarget: { url: `ws://127.0.0.1:${PORT}/room` },
  });
  assert(sdkResult.id === processId && sdkResult.cleared === true, "SDK clearLogs returned an unexpected payload");
  await assertLogsEmpty();
  await waitForClearNotification(sdkMessageIndex);
  console.log("OK: SDK clearLogs used client.processId and pushed logCleared");

  await emitLogs(`MCP_CLEAR_${Date.now()}`);
  const mcpMessageIndex = messages.length;
  await initializeMcp();
  const response = await mcpCall("log-clear-call", "tools/call", {
    name: "clear-process-logs",
    arguments: { id: processId },
  });
  const toolText = response.result?.content?.find((part) => part.type === "text")?.text;
  const toolResult = toolText ? JSON.parse(toolText) : null;
  assert(toolResult?.id === processId && toolResult?.cleared === true, "MCP clear-process-logs returned an unexpected payload");
  await assertLogsEmpty();
  await waitForClearNotification(mcpMessageIndex);
  console.log("OK: MCP clear-process-logs pushed logCleared");

  console.log("ALL CHECKS PASSED");
}

try {
  await main();
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
} finally {
  socket?.close();
  if (processId) {
    try {
      await request("DELETE", `/api/processes/${processId}`);
    } catch (error) {
      console.error(`cleanup failed for ${processId}:`, error);
      process.exitCode = 1;
    }
  }
}
