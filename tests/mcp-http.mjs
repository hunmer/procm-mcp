// MCP over HTTP (Streamable HTTP transport at /mcp):
//   - initialize handshake works
//   - tools/list returns the same 4 tools as stdio
//   - tool calls work over HTTP (process list)
//   - state is shared with the REST API (process started via MCP is visible via REST)
import {
  startBackend,
  stopBackend,
  http,
  mcpHttp,
  mcpHttpHandshake,
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

await runTest("/mcp initialize handshake", async () => {
  backend = await startBackend({ port });
  const r = await mcpHttp(port, 1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0" },
  });
  assert(!!r.result, "got an initialize result");
  assertEqual(r.result.serverInfo.name, "procm-mcp", "server name");
  assertEqual(r.result.protocolVersion, "2025-06-18", "protocol version echoed");
});

await runTest("/mcp CORS preflight allows Inspector headers", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:6274",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "accept,authorization,content-type,mcp-protocol-version,mcp-session-id,x-mcp-proxy-auth",
    },
  });
  assertEqual(res.status, 204, "preflight status");
  const allowed = res.headers.get("access-control-allow-headers") || "";
  for (const header of ["mcp-protocol-version", "mcp-session-id", "x-mcp-proxy-auth"]) {
    assert(allowed.toLowerCase().includes(header), `allows ${header}`);
  }
  assertEqual(res.headers.get("access-control-allow-origin"), "http://localhost:6274", "origin");
});

await runTest("tools/list returns 4 tools over HTTP", async () => {
  await mcpHttpHandshake(port);
  const r = await mcpHttp(port, 2, "tools/list", {});
  const names = r.result.tools.map((t) => t.name);
  assertEqual(names.length, 4, "4 tools");
  assert(names.includes("process-logs"), "has process-logs");
  assert(names.includes("start-process"), "has start-process");
  assert(names.includes("process"), "has process");
});

await runTest("tool call works: process list", async () => {
  const r = await mcpHttp(port, 3, "tools/call", { name: "process", arguments: { action: "list" } });
  assert(/No processes|Running processes/.test(r.result.content[0].text), "process list answered");
});

await runTest("state shared with REST API", async () => {
  // Start via MCP, then confirm visible via REST.
  const uniq = `httpmcp-${Date.now()}`;
  const args = ["-e", uniq, "ok"];
  const start = await mcpHttp(port, 4, "tools/call", {
    name: "start-process",
    arguments: { script: "node", args, cwd: projectRoot, name: "shared-probe" },
  });
  assert(/Process started/.test(start.result.content[0].text), "started via MCP-HTTP");
  await sleep(200);

  // The process should appear in the REST listing (shared process-manager state).
  const list = await http(port, "GET", "/api/processes");
  assertEqual(list.data.processes.length, 1, "REST sees the MCP-started process");
  assertEqual(list.data.processes[0].name, "shared-probe", "same process via REST");

  // Clean it up via REST.
  await http(port, "POST", `/api/processes/${list.data.processes[0].id}/stop`, {});
});

stopBackend(backend);
summarize();
