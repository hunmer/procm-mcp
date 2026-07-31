// CLI client roundtrip: run `node build/index.js <cmd>` against a running backend.
import { spawn } from "node:child_process";
import {
  startBackend,
  stopBackend,
  randomPort,
  assert,
  assertEqual,
  runTest,
  summarize,
  sleep,
  projectRoot,
  buildIndex,
} from "./_helpers.mjs";

const port = randomPort();
let backend;

// Run the CLI client and return { code, stdout, stderr }.
function cli(...args) {
  return new Promise((resolve) => {
    const child = spawn(
      "node",
      [buildIndex, ...args, "--port", String(port)],
      { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
    );
    const out = [];
    const err = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    child.on("exit", (code) =>
      resolve({
        code,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      }),
    );
  });
}

await runTest("ping reaches the backend", async () => {
  backend = await startBackend({ port });
  const r = await cli("ping");
  assertEqual(r.code, 0, "ping exit 0");
  assert(r.stdout.includes("backend reachable"), "ping reports reachable");
});

await runTest("ps on empty backend", async () => {
  const r = await cli("ps");
  assertEqual(r.code, 0, "ps exit 0");
  assert(r.stdout.includes("No processes"), "empty ps message");
});

let startedId;
await runTest("start via CLI then list shows it", async () => {
  const r = await cli(
    "start",
    "node",
    "-e",
    "setInterval(()=>console.log('tick'),500)",
    "--name",
    "cli-probe",
  );
  assertEqual(r.code, 0, "start exit 0");
  const m = r.stdout.match(/ID: ([^\s)]+)/);
  assert(!!m, "start prints an id");
  startedId = m[1];
  await sleep(300);

  const ps = await cli("ps");
  assert(ps.stdout.includes(startedId), "ps lists the started id");
  assert(ps.stdout.includes("cli-probe"), "ps lists the name");
});

await runTest("info returns details", async () => {
  const r = await cli("info", startedId);
  assertEqual(r.code, 0, "info exit 0");
  assert(r.stdout.includes("Name:     cli-probe"), "info shows name");
  assert(r.stdout.includes("Status:   running"), "info shows running");
});

await runTest("logs capture the tick output", async () => {
  await sleep(700);
  const r = await cli("logs", startedId, "--stream", "stdout", "-n", "20");
  assertEqual(r.code, 0, "logs exit 0");
  assert(r.stdout.includes("tick"), "logs show tick");
});

await runTest("grep finds the pattern", async () => {
  const r = await cli("grep", startedId, "tick", "--stream", "stdout");
  assertEqual(r.code, 0, "grep exit 0");
  assert(r.stdout.includes("tick"), "grep shows tick");
});

await runTest("restart then stop", async () => {
  const restart = await cli("restart", startedId);
  assertEqual(restart.code, 0, "restart exit 0");
  assert(restart.stdout.includes("restarted"), "restart message");

  const stop = await cli("stop", startedId);
  assertEqual(stop.code, 0, "stop exit 0");
  assert(stop.stdout.includes("stopped"), "stop message");

  const ps = await cli("ps");
  assert(!ps.stdout.includes(startedId), "process gone after stop");
});

await runTest("ping with an invalid port fails cleanly", async () => {
  // Port 0 is rejected by the client's port validation.
  const r = await new Promise((resolve) => {
    const child = spawn("node", [buildIndex, "ping", "--port", "0"], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const err = [];
    child.stderr.on("data", (c) => err.push(c));
    child.on("exit", (code) =>
      resolve({ code, stderr: Buffer.concat(err).toString("utf8") }),
    );
  });
  assertEqual(r.code, 1, "invalid port exit 1");
  assert(/invalid port/.test(r.stderr), "invalid port error message");
});

await runTest("ping against an unreachable port fails cleanly", async () => {
  // A valid-but-unbound port → connection refused, not an invalid-port error.
  const r = await new Promise((resolve) => {
    const child = spawn("node", [buildIndex, "ping", "--port", "19999"], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const err = [];
    child.stderr.on("data", (c) => err.push(c));
    child.on("exit", (code) =>
      resolve({ code, stderr: Buffer.concat(err).toString("utf8") }),
    );
  });
  assertEqual(r.code, 1, "unreachable exit 1");
  assert(/cannot connect/.test(r.stderr), "cannot-connect message");
});

stopBackend(backend);
summarize();
