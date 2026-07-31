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

await runTest("start a process and see it running", async () => {
  backend = await startBackend({ port });
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
  assertEqual(list.data.processes.length, 1, "one process listed");
  assertEqual(list.data.processes[0].id, id, "listed id matches");
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

await runTest("stop removes the process", async () => {
  const id = globalThis.__id;
  const r = await http(port, "POST", `/api/processes/${id}/stop`, {});
  assertEqual(r.status, 200, "stop status");
  const info = await http(port, "GET", `/api/processes/${id}`);
  assertEqual(info.status, 404, "process gone after stop");
  const list = await http(port, "GET", "/api/processes");
  assertEqual(list.data.processes.length, 0, "no processes left");
});

stopBackend(backend);
summarize();
