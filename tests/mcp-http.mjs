// MCP over HTTP (Streamable HTTP transport at /mcp):
//   - initialize handshake works
//   - tools/list exposes process, batch, room, and log-file tools
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

await runTest("tools/list returns process and room tools over HTTP", async () => {
  await mcpHttpHandshake(port);
  const r = await mcpHttp(port, 2, "tools/list", {});
  const names = r.result.tools.map((t) => t.name);
  for (const name of ["process-logs", "process-log-files", "log-files", "start-process", "process", "batch-process", "room", "room-logs", "trace-get"]) {
    assert(names.includes(name), `has ${name}`);
  }
  const roomLogs = r.result.tools.find((tool) => tool.name === "room-logs");
  assert(!!roomLogs?.inputSchema?.properties?.traceId, "room-logs exposes traceId filter");
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
    arguments: { script: "node", args, cwd: projectRoot, name: "shared-probe", group: "test" },
  });
  assert(/Process started/.test(start.result.content[0].text), "started via MCP-HTTP");
  const id = (await http(port, "GET", "/api/processes")).data.processes[0].id;
  const pathsCall = await mcpHttp(port, 5, "tools/call", {
    name: "process-log-files",
    arguments: { id },
  });
  const paths = JSON.parse(pathsCall.result.content[0].text);
  assert(/^(?:[A-Za-z]:[\\/]|\/)/.test(paths.stdoutPath), "process-log-files returns an absolute stdout path");
  assert(/^(?:[A-Za-z]:[\\/]|\/)/.test(paths.stderrPath), "process-log-files returns an absolute stderr path");
  await sleep(200);
  const listCall = await mcpHttp(port, 6, "tools/call", {
    name: "log-files",
    arguments: { processId: id },
  });
  const listed = JSON.parse(listCall.result.content[0].text);
  assert(listed.files.length >= 1, "log-files lists existing streams for the selected process");
  assert(listed.files.every((file) => file.processId === id && /^(?:[A-Za-z]:[\\/]|\/)/.test(file.path)), "log-files filters by process and returns absolute paths");
  // The process should appear in the REST listing (shared process-manager state).
  const list = await http(port, "GET", "/api/processes");
  assertEqual(list.data.processes.length, 1, "REST sees the MCP-started process");
  assertEqual(list.data.processes[0].name, "shared-probe", "same process via REST");

  // Clean it up via REST.
  await http(port, "POST", `/api/processes/${list.data.processes[0].id}/stop`, {});
});

stopBackend(backend);
summarize();
