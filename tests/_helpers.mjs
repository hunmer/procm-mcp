// Shared helpers for procm-mcp test scripts.
// Each test starts a fresh --server backend on a random port, talks to it over
// HTTP or MCP-stdio, asserts, then tears down. No external test framework.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(__dirname, "..");
export const buildIndex = resolve(projectRoot, "build", "index.js");
// A no-op long-lived process used as a stand-in child to start via the server.
export const exampleProcess = resolve(__dirname, "example-process.js");

// ---- tiny assertion helpers ----
export let failures = 0;
export let passed = 0;

export function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

export function assertEqual(actual, expected, msg) {
  const ok = actual === expected;
  assert(ok, `${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

// ---- backend lifecycle ----
export async function startBackend({ port, allowAll = false } = {}) {
  const args = [buildIndex, "--server", "--port", String(port)];
  if (allowAll) args.push("--allow-all");
  const child = spawn("node", args, {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PROCM_ALLOW_ALL: allowAll ? "1" : "" },
  });
  // Wait until /api/processes responds.
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/processes`);
      if (r.ok) return child;
    } catch {
      /* not ready */
    }
    await sleep(150);
  }
  child.kill("SIGKILL");
  throw new Error(`backend on port ${port} did not become ready`);
}

export function stopBackend(child) {
  if (child && !child.killed) child.kill("SIGTERM");
}

// Pick a likely-free random port. The caller passes it to startBackend.
export function randomPort() {
  // Avoid privileged/ephemeral-edge; tests pick from this range.
  return 20000 + Math.floor(Math.random() * 10000);
}

// ---- HTTP helper ----
export async function http(port, method, path, body, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: res.status, data };
}

// ---- MCP-over-stdio helper ----
// Sends requests SERIALLY: one at a time, waiting for each response before the
// next. This matters because the MCP SDK may dispatch concurrently-received
// requests in parallel, which races dependent calls (e.g. allow-start-process
// then start-process). Never close stdin (that triggers cleanup+exit); we kill
// the server when done.
export async function mcpCalls(requests, { allowAll = false } = {}) {
  const args = [buildIndex];
  if (allowAll) args.push("--allow-all");
  const child = spawn("node", args, {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "ignore"],
  });

  // Initialize handshake first.
  const initId = "__init";
  const pending = new Map(); // id -> resolve
  const results = {};
  let buf = "";
  child.stdout.on("data", (c) => {
    buf += c.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const o = JSON.parse(line);
        if (o && typeof o.id !== "undefined") {
          results[o.id] = o;
          const r = pending.get(o.id);
          if (r) {
            r();
            pending.delete(o.id);
          }
        }
      } catch {
        /* ignore */
      }
    }
  });

  function send(req) {
    return new Promise((resolve) => {
      pending.set(req.id, resolve);
      child.stdin.write(JSON.stringify(req) + "\n");
    });
  }

  // Handshake (wait for initialize response before notifications/initialized).
  await send({
    jsonrpc: "2.0",
    id: initId,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    },
  });
  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
  );
  // Small gap so the server registers the initialized notification.
  await sleep(100);

  // Run each request in order, awaiting its response.
  for (const r of requests) {
    await send(r);
    // Allow any downstream disk flush (e.g. allow list write) to land.
    await sleep(150);
  }

  // Give a final beat for any trailing output, then tear down.
  await sleep(200);
  child.kill("SIGKILL");
  await new Promise((res) => child.on("exit", res));
  // Drop the synthetic init id from results for cleanliness.
  delete results[initId];
  return results;
}

// ---- MCP-over-HTTP client helper ----
// Talks to the /mcp Streamable HTTP endpoint on a running backend. Each call is
// a fresh POST (stateless server). Parses SSE "data:" lines for the response.
export async function mcpHttp(port, id, method, params) {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  const dataLines = text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => {
      try {
        return JSON.parse(l.slice(6));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return dataLines[0];
}

// One-time MCP-over-HTTP handshake (initialize + initialized) — needed before
// the server answers tool calls.
export async function mcpHttpHandshake(port) {
  await mcpHttp(port, "__hs", "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0" },
  });
  await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
}

// ---- test runner ----
export async function runTest(name, fn) {
  console.log(`\n▶ ${name}`);
  const beforeFail = failures;
  try {
    await fn();
  } catch (e) {
    failures++;
    console.error(`  ✗ threw: ${e && e.stack ? e.stack : e}`);
  }
  const ok = failures === beforeFail;
  console.log(ok ? `  ✓ passed` : `  ✗ FAILED`);
}

export function summarize() {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`assertions: ${passed} passed, ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

export { sleep };
