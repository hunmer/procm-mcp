// MCP-over-HTTP (Streamable HTTP transport) on top of the existing Node http server.
// Exposes a real MCP endpoint at /mcp so clients can configure:
//   { "type": "http", "url": "http://127.0.0.1:<port>/mcp" }
//
// Runs in STATELESS mode (sessionIdGenerator: undefined): each request gets a
// fresh transport + McpServer. The durable state (process list, server id)
// lives in the shared modules, so it is consistent across requests and with
// the REST API / dashboard.
import http from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { serverLog } from "./server-log.js";
import { toErrorMessage } from "./error.js";
import { registerProcessTools } from "./tools/process.js";
import { registerProcessLogTools } from "./tools/process-logs.js";
import { registerProcmCommandsTools } from "./tools/procm-commands.js";

// Register every tool onto a fresh McpServer. Called once per request in
// stateless mode.
function registerAllTools(server: McpServer) {
  registerProcessTools(server);
  registerProcessLogTools(server);
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

// CORS support for browser-based MCP clients (e.g. MCP Inspector), which load
// from a different origin than this server and would otherwise be blocked by
// the browser's same-origin policy. Strategy: reflect the request's Origin.
// Safe because the HTTP server is bound to 127.0.0.1 (loopback only). When no
// Origin header is present (e.g. curl), no CORS headers are added — same-origin
// and non-browser clients don't need them.
const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, MCP-Protocol-Version, MCP-Session-Id, X-MCP-Proxy-Auth, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Session-Id, MCP-Protocol-Version",
  "Access-Control-Allow-Credentials": "true",
  // Reflecting Origin means responses vary by origin, so caches must key on it.
  Vary: "Origin",
};

// The MCP transport drives the response itself via hono's request listener,
// which calls res.writeHead(status, headers) with the headers it built — that
// would overwrite anything we setHeader'd beforehand. Wrap writeHead so CORS
// headers are merged into the headers passed to writeHead, before they're
// flushed. Scoped to this one request's res.
function patchWriteHeadForCors(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const original = res.writeHead.bind(res);
  // writeHead overloads: (code), (code, reason), (code, headers), (code, reason, headers).
  // Normalize to find the headers argument and inject CORS there.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.writeHead = ((...args: any[]) => {
    if (req.headers.origin) {
      // args: [code] | [code, reason] | [code, headers] | [code, reason, headers]
      // The headers object is the last argument when present, and is an object
      // (not a string reason).
      let idx = -1;
      for (let i = args.length - 1; i >= 1; i--) {
        if (args[i] && typeof args[i] === "object") {
          idx = i;
          break;
        }
      }
      const corsHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": req.headers.origin,
        ...CORS_HEADERS,
      };
      if (idx !== -1) {
        for (const [k, v] of Object.entries(corsHeaders)) {
          (args[idx] as Record<string, string>)[k] = v;
        }
      } else {
        args.push(corsHeaders);
      }
    }
    return original(...(args as [number]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

// Handle a single request against the /mcp endpoint. Returns true if the
// request was handled as MCP, false if it should fall through to REST.
export async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  if (req.url?.split("?")[0] !== "/mcp") return false;

  // Apply CORS to every /mcp response (browser clients like MCP Inspector load
  // cross-origin). Harmless for same-origin / non-browser callers (no Origin).
  patchWriteHeadForCors(req, res);

  // CORS preflight: browsers send OPTIONS before the real POST. Handle it here
  // and short-circuit, otherwise it would fall through to the 404 handler and
  // the browser would block the subsequent request.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

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
