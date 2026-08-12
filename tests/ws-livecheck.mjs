// Live WebSocket end-to-end check for the dashboard push channel.
// Starts a backend on a random port, connects a WS client, starts a process
// that emits stdout, and asserts that both "processes" and "log" messages
// arrive. Exits non-zero on failure.
import { spawn } from "child_process";
import { setTimeout as delay } from "timers/promises";
import WebSocket from "ws";

const PORT = 17331 + Math.floor(Math.random() * 1000);

const backend = spawn(
  process.execPath,
  ["./build/index.js", "--server", "--port", String(PORT)],
  { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
);
backend.stdout.on("data", () => {});
let readySeen = false;
backend.stderr.on("data", (b) => {
  const s = b.toString();
  process.stderr.write(`[backend] ${s}`);
  if (s.includes("procm-mcp backend (HTTP) ready")) readySeen = true;
});
backend.on("exit", (code) => {
  process.stderr.write(`[backend exited code=${code}]\n`);
});

const wsUrl = `ws://127.0.0.1:${PORT}/ws`;

function waitFor(predicate, { timeout = 10000, interval = 100 } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        if (predicate()) return resolve();
      } catch (err) {
        return reject(err);
      }
      if (Date.now() - start > timeout) {
        return reject(new Error(`waitFor timed out (${timeout}ms)`));
      }
      setTimeout(tick, interval);
    };
    tick();
  });
}

async function main() {
  // Wait for the backend to print its ready banner, which guarantees the WS
  // upgrade handler is registered (it is attached inside the listen callback,
  // before startHttpServer resolves and the banner prints).
  await waitFor(
    () => readySeen,
    { timeout: 15000 },
  );
  console.log("OK: backend ready");

  let connected = false;
  let ws = null;

  // Open the WebSocket with a few retries to absorb any startup race.
  const connectOnce = () =>
    new Promise((resolve) => {
      const s = new WebSocket(wsUrl);
      s.on("open", () => resolve(s));
      s.on("error", () => resolve(null));
      setTimeout(() => resolve(s.readyState === WebSocket.OPEN ? s : null), 2000);
    });
  for (let i = 0; i < 5 && !connected; i++) {
    ws = await connectOnce();
    if (ws) connected = true;
    else await delay(500);
  }
  if (!connected) throw new Error("could not open WebSocket after retries");
  console.log("OK: WebSocket connected");

  let gotSnapshot = false;
  let sawProcessId = null;
  const logMessages = [];
  const processMessages = [];

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "processes") {
      processMessages.push(msg);
      if (msg.snapshot) gotSnapshot = true;
      const started = msg.data.find((p) => p.name && p.name.includes("emitlog"));
      if (started) sawProcessId = started.id;
    } else if (msg.type === "log") {
      logMessages.push(msg);
    }
  });

  await waitFor(() => connected, { timeout: 8000 });
  await waitFor(() => gotSnapshot, { timeout: 8000 });
  console.log("OK: connected, received initial processes snapshot");

  // Start a process that emits a unique marker line on stdout.
  const marker = `WSLOG_${Date.now()}`;
  const res = await fetch(`http://127.0.0.1:${PORT}/api/processes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "emitlog",
      script: process.platform === "win32" ? "cmd" : "sh",
      args: process.platform === "win32" ? ["/c", `echo ${marker} & ping -n 3 127.0.0.1 >nul`] : ["-c", `echo ${marker}; sleep 2`],
      cwd: process.cwd(),
    }),
  });
  const started = await res.json();
  if (!started.id) throw new Error("start failed: " + JSON.stringify(started));
  console.log("OK: started process", started.id);

  // Expect a processes update that includes our process.
  await waitFor(() => sawProcessId === started.id, { timeout: 8000 });
  console.log("OK: saw process in a live processes push");

  // Expect a log push carrying the marker.
  await waitFor(
    () => logMessages.some((m) => m.message && m.message.includes(marker)),
    { timeout: 8000 },
  );
  console.log("OK: received live log push with marker");

  // Restart keeps the id but replaces the child process. The final WS view
  // must match REST; otherwise an older async snapshot arrived last and left
  // the dashboard showing stale status/pid data.
  const beforeRestart = processMessages
    .flatMap((m) => m.data)
    .find((p) => p.id === started.id);
  const restartRes = await fetch(
    `http://127.0.0.1:${PORT}/api/processes/${started.id}/restart`,
    { method: "POST" },
  );
  if (!restartRes.ok) throw new Error(`restart failed: ${restartRes.status}`);

  await waitFor(
    () => processMessages.some((m) => {
      const p = m.data.find((candidate) => candidate.id === started.id);
      return p && p.lastStartedAt !== beforeRestart?.lastStartedAt;
    }),
    { timeout: 8000 },
  );
  await delay(250);
  const restProcesses = await fetch(
    `http://127.0.0.1:${PORT}/api/processes`,
  ).then((r) => r.json());
  const expected = restProcesses.processes.find((p) => p.id === started.id);
  const finalMessage = processMessages.at(-1);
  const actual = finalMessage?.data.find((p) => p.id === started.id);
  if (
    !actual ||
    actual.status !== expected?.status ||
    actual.pid !== expected?.pid ||
    actual.lastStartedAt !== expected?.lastStartedAt
  ) {
    throw new Error(
      `final WS state is stale: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
  console.log("OK: final process push matches REST after restart");

  ws.close();
  console.log("ALL CHECKS PASSED");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
