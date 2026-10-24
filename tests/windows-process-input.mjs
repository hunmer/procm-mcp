// Run against a backend managed by the global procm-mcp (7332 by default).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { http, mcpHttp } from "./_helpers.mjs";

if (process.platform !== "win32") {
  console.log("SKIP: Windows process-tree signal regression");
  process.exit(0);
}

const backendPort = Number(process.env.PROCM_TEST_PORT ?? 7332);
const directory = await mkdtemp(join(tmpdir(), "procm-signal-test-"));
const fixture = fileURLToPath(new URL("./fixtures/process-tree-server.mjs", import.meta.url));
const execFileAsync = promisify(execFile);
const ownedPids = new Set();
let processId;
let requestId = 0;

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

async function waitFor(check, description) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${description}`);
}

async function request(method, path, body) {
  const result = await http(backendPort, method, path, body);
  assert.ok(result.status < 300, JSON.stringify(result));
  return result.data;
}

async function tool(name, args) {
  const reply = await mcpHttp(backendPort, ++requestId, "tools/call", { name, arguments: args });
  assert.ok(reply?.result, JSON.stringify(reply));
  return reply.result.content[0].text;
}

const listener = createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));

async function worker() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) });
    const info = await response.json();
    assert.equal(info.marker, "process-tree-test");
    ownedPids.add(info.pid);
    return info;
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    return null;
  }
}

try {
  await writeFile(join(directory, "wrapper.cmd"), `@echo off\r\n"${process.execPath}" "${fixture}"\r\n`);
  for (const signal of ["SIGINT", "SIGTERM", "SIGKILL", "SIGQUIT"]) {
    const started = await tool("start-process", {
      script: "./wrapper.cmd",
      cwd: directory,
      envs: { PROCM_TEST_PORT: String(port) },
      name: `windows-signal-regression-${signal}`,
    });
    processId = started.match(/ID: ([A-Za-z0-9_-]+)/)?.[1];
    assert.ok(processId, started);
    const oldWorker = await waitFor(worker, "initial server to listen");
    const wrapper = await request("GET", `/api/processes/${processId}`);
    assert.notEqual(wrapper.pid, oldWorker.pid, "fixture must run behind a cmd wrapper");
    console.log(`${signal}: wrapper=${wrapper.pid}, worker=${oldWorker.pid}, port=${port}`);

    const invalid = await http(backendPort, "POST", `/api/processes/${processId}/input`, { text: "x", signal });
    assert.equal(invalid.status, 400, "text and signal remain mutually exclusive");
    const input = await request("POST", `/api/processes/${processId}/input`, { text: "", newline: false });
    assert.equal(input.kind, "text", "stdin writes still work");
    const unsupported = await http(backendPort, "POST", `/api/processes/${processId}/input`, { signal: "SIGUSR1" });
    assert.equal(unsupported.status, 400, "unsupported Windows signals must not terminate the tree");
    assert.equal((await worker())?.pid, oldWorker.pid);

    const result = await request("POST", `/api/processes/${processId}/input`, { signal });
    assert.equal(result.kind, "signal");
    await waitFor(() => !isAlive(oldWorker.pid), `worker ${oldWorker.pid} to exit after ${signal}`);
    await waitFor(async () => (await request("GET", `/api/processes/${processId}`)).status === "exited", "wrapper exit state");
    assert.equal(await worker(), null, "old listener must release its port");

    const restarted = await tool("process", { action: "restart", id: processId });
    assert.match(restarted, /has been restarted/);
    const newWorker = await waitFor(worker, "restarted server to bind the same port");
    assert.notEqual(newWorker.pid, oldWorker.pid);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal((await worker())?.pid, newWorker.pid, "restarted server stays alive");
    assert.equal((await request("GET", `/api/processes/${processId}`)).status, "running");

    await request("POST", `/api/processes/${processId}/stop`, {});
    await waitFor(() => !isAlive(newWorker.pid), "stop to terminate the restarted worker");
    await request("DELETE", `/api/processes/${processId}`);
    processId = undefined;
    console.log(`PASS: ${signal} cleaned the tree; MCP restart reused port ${port}; stop cleaned the new tree`);
  }
} finally {
  try {
    if (processId) await request("DELETE", `/api/processes/${processId}`);
  } finally {
    // The unfixed backend leaves the fixture worker orphaned; clean only PIDs
    // identified by this test's HTTP fixture, including on a failed assertion.
    for (const pid of ownedPids) {
      if (isAlive(pid)) await execFileAsync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    }
    await rm(directory, { recursive: true, force: true });
  }
}
