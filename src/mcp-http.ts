// MCP-over-HTTP (Streamable HTTP transport) on top of the existing Node http server.
// Exposes a real MCP endpoint at /mcp so clients can configure:
//   { "type": "http", "url": "http://127.0.0.1:<port>/mcp" }
//
// Runs in STATELESS mode (sessionIdGenerator: undefined): each request gets a
// fresh transport + McpServer. The durable state (process list, allow list,
// server id) lives in the shared modules, so it is consistent across requests
// and with the REST API / dashboard.
import http from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { serverLog } from "./server-log.js";
import { toErrorMessage } from "./error.js";
import { registerServerInfoTools } from "./tools/server-info.js";
import { registerAllowedProcessTools } from "./tools/allowed-process.js";
import { registerProcessTools } from "./tools/process.js";
import { registerProcessLogTools } from "./tools/process-logs.js";
import { registerGrepLogsTools } from "./tools/grep-logs.js";
import { registerProcmCommandsTools } from "./tools/procm-commands.js";

// Register every tool onto a fresh McpServer. Called once per request in
// stateless mode.
function registerAllTools(server: McpServer) {
  registerServerInfoTools(server);
  registerAllowedProcessTools(server);
  registerProcessTools(server);
  registerProcessLogTools(server);
  registerGrepLogsTools(server);
  registerProcmCommandsTools(server);
}

// Build a one-shot McpServer + stateless transport wired together.
async function createSession(): Promise<{
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}> {
  const server = new McpServer({ name: "procm-mcp", version: "1.0.0" });
  registerAllTools(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });
  transport.onerror = (err) => {
    serverLog(`MCP HTTP transport error: ${toErrorMessage(err)}`);
  };
  await server.connect(transport);
  return { server, transport };
}

// MCP transport only accepts POST (JSON-RPC), GET (SSE stream), DELETE (close).
function isMcpMethod(method: string | undefined): boolean {
  return method === "POST" || method === "GET" || method === "DELETE";
}

// Handle a single request against the /mcp endpoint. Returns true if the
// request was handled as MCP, false if it should fall through to REST.
export async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  if (req.url?.split("?")[0] !== "/mcp") return false;
  if (!isMcpMethod(req.method)) return false;

  let session: { server: McpServer; transport: StreamableHTTPServerTransport };
  try {
    session = await createSession();
  } catch (e) {
    serverLog(`MCP session setup failed: ${toErrorMessage(e)}`);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: toErrorMessage(e) }));
    return true;
  }

  // When the response finishes, close the transport/server to release resources.
  res.on("close", () => {
    session.server.close().catch(() => {});
    session.transport.close().catch(() => {});
  });

  try {
    await session.transport.handleRequest(req, res);
  } catch (e) {
    serverLog(`MCP request handling failed: ${toErrorMessage(e)}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: toErrorMessage(e) }));
    } else {
      res.end();
    }
  }
  return true;
}
