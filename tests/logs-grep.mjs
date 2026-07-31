// stdout/stderr capture + grep over HTTP. Uses example-process.js which prints
// a counter to stdout and an error line to stderr every second.
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
  exampleProcess,
} from "./_helpers.mjs";

const port = randomPort();
let backend;
let id;

const MARKER = "PROCM_LOG_MARKER";

await runTest("capture stdout and stderr", async () => {
  backend = await startBackend({ port });
  const { data } = await http(port, "POST", "/api/processes", {
    script: "node",
    args: [exampleProcess],
    cwd: process.cwd(),
    name: "logger",
    envs: { PROCM_MCP_TEST_VAR1: MARKER },
  });
  id = data.id;
  // Let it emit a few lines.
  await sleep(2500);

  const out = await http(port, "GET", `/api/processes/${id}/logs?stream=stdout&count=50`);
  const err = await http(port, "GET", `/api/processes/${id}/logs?stream=stderr&count=50`);
  assert(out.data.text.includes(MARKER), "stdout captured the env marker");
  assert(out.data.text.includes("error message") === false, "stdout has no error line");
  assert(err.data.text.includes("error message"), "stderr has the error line");
});

await runTest("grep matches the marker", async () => {
  // The marker is a plain alphanumeric literal, safe as a regex across platforms.
  await sleep(500);
  const g = await http(
    port,
    "GET",
    `/api/processes/${id}/logs?stream=stdout&grep=${encodeURIComponent(MARKER)}&count=50`,
  );
  assertEqual(g.status, 200, "grep status");
  assert(g.data.text.length > 0, "grep returned matches");
  assert(g.data.text.includes(MARKER), "grep match contains marker");
});

await runTest("grep with no matches is empty", async () => {
  const g = await http(
    port,
    "GET",
    `/api/processes/${id}/logs?stream=stdout&grep=__no_such_token_zzz__&count=50`,
  );
  assertEqual(g.status, 200, "grep status");
  assertEqual(g.data.text, "", "no matches → empty text");
});

await runTest("grep with invalid regex returns 400", async () => {
  const g = await http(
    port,
    "GET",
    `/api/processes/${id}/logs?stream=stdout&grep=${encodeURIComponent("[(")}&count=50`,
  );
  assertEqual(g.status, 400, "bad regex → 400");
  assert(!!g.data.error, "has error message");
});

await http(port, "POST", `/api/processes/${id}/stop`, {});
stopBackend(backend);
summarize();
