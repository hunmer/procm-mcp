// Process lifecycle over HTTP: start → info → list → restart → stop.
import {
  startBackend,
  stopBackend,
  http,
  randomPort,
  assert,
  assertEqual,
  runTest,
  summarize,
  sleep,
  projectRoot,
} from "./_helpers.mjs";

const port = randomPort();
let backend;

await runTest("failed starts do not poison later process cleanup", async () => {
  backend = await startBackend({ port });
  for (let i = 0; i < 2; i++) {
    const failed = await http(port, "POST", "/api/processes", {
      script: "__procm_missing_command__",
      cwd: projectRoot,
      name: `failed-start-${i}`,
    });
    assertEqual(failed.status, 500, `failed start ${i + 1} status`);
  }

  const list = await http(port, "GET", "/api/processes");
  assert(
    !list.data.processes.some((p) => p.name.startsWith("failed-start-")),
    "failed starts are not tracked",
  );
});

await runTest("start a process and see it running", async () => {
  const { data, status } = await http(port, "POST", "/api/processes", {
    script: "node",
    args: ["-e", "setInterval(()=>{}, 60000)"],
    cwd: projectRoot,
    name: "lifecycle-probe",
  });
  assertEqual(status, 201, "POST /api/processes status");
  assert(!!data.id, "got a process id");
  globalThis.__id = data.id;
});

await runTest("info + list reflect the process", async () => {
  const id = globalThis.__id;
  const info = await http(port, "GET", `/api/processes/${id}`);
  assertEqual(info.status, 200, "GET info status");
  assertEqual(info.data.name, "lifecycle-probe", "name");
  assertEqual(info.data.script, "node", "script");

  const list = await http(port, "GET", "/api/processes");
  assert(
    list.data.processes.some((p) => p.id === id),
    "started process is listed",
  );
});

await runTest("restart keeps the id", async () => {
  const id = globalThis.__id;
  const r = await http(port, "POST", `/api/processes/${id}/restart`, {});
  assertEqual(r.status, 200, "restart status");
  assertEqual(r.data.restarted, true, "restarted flag");
  await sleep(300);
  const info = await http(port, "GET", `/api/processes/${id}`);
  assertEqual(info.data.status, "running", "running again after restart");
});

await runTest("restart continues when the old pid is already gone", async () => {
  const started = await http(port, "POST", "/api/processes", {
    script: "node",
    args: ["-e", "process.exit(0)"],
    cwd: projectRoot,
    name: "stale-pid-probe",
  });
  assertEqual(started.status, 201, "stale pid process start status");
  await sleep(300);

  const restarted = await http(
    port,
    "POST",
    `/api/processes/${started.data.id}/restart`,
    {},
  );
  assertEqual(restarted.status, 200, "restart succeeds after old pid exits");
  await http(port, "POST", `/api/processes/${started.data.id}/stop`, {});
});

await runTest("stop removes the process", async () => {
  const id = globalThis.__id;
  const r = await http(port, "POST", `/api/processes/${id}/stop`, {});
  assertEqual(r.status, 200, "stop status");
  const info = await http(port, "GET", `/api/processes/${id}`);
  assertEqual(info.status, 404, "process gone after stop");
});

stopBackend(backend);
summarize();
