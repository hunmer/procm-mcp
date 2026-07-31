#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toErrorMessage } from "./error.js";
import { serverLog, serverId } from "./server-log.js";
import { cleanup } from "./process-manager.js";
import {
  startHttpServer,
  startHttpServerIfConfigured,
} from "./http-server.js";
import { registerServerInfoTools } from "./tools/server-info.js";
import { registerAllowedProcessTools } from "./tools/allowed-process.js";
import { registerProcessTools } from "./tools/process.js";
import { registerProcessLogTools } from "./tools/process-logs.js";
import { registerGrepLogsTools } from "./tools/grep-logs.js";
import { registerProcmCommandsTools } from "./tools/procm-commands.js";

const DEFAULT_SERVER_PORT = 7331;

// Minimal CLI flag parsing. Supports:
//   --server            Run as an HTTP-only backend (no MCP stdio transport)
//   --port <number>     Dashboard port (with --server, or to override PROCM_HTTP_PORT)
function parseArgs(argv: string[]) {
  const flags = { server: false, port: NaN as number };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--server") {
      flags.server = true;
    } else if (a === "--port") {
      flags.port = Number(argv[i + 1]);
      i++;
    } else if (a.startsWith("--port=")) {
      flags.port = Number(a.slice("--port=".length));
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        [
          "Usage: procm-mcp [--server] [--port <number>]",
          "",
          "Modes:",
          "  (default)         MCP server over stdio. Optional HTTP dashboard if PROCM_HTTP_PORT is set.",
          "  --server          HTTP-only backend: no MCP stdio transport, dashboard always starts.",
          "",
          "Options:",
          "  --port <number>   Dashboard port (default: 7331, or PROCM_HTTP_PORT).",
          "  -h, --help        Show this help.",
        ].join("\n") + "\n",
      );
      process.exit(0);
    }
  }
  return flags;
}

try {
  const cli = parseArgs(process.argv.slice(2));

  // --server: run as a standalone HTTP backend (no MCP stdio transport).
  // The dashboard is always started; the process stays alive to serve it.
  if (cli.server) {
    const port =
      Number.isFinite(cli.port) && cli.port > 0
        ? cli.port
        : Number(process.env.PROCM_HTTP_PORT) || DEFAULT_SERVER_PORT;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      serverLog(`Invalid port "${port}".`);
      exitProcess(1);
    }

    startHttpServer(port);
    serverLog(
      `Server started with ID: ${serverId}, PID: ${process.pid} (HTTP backend mode on port ${port}).`,
    );
    installSignalHandlers();
  } else {
    const server = new McpServer({
      name: "procm-mcp",
      version: "1.0.0",
    });

    registerServerInfoTools(server);
    registerAllowedProcessTools(server);
    registerProcessTools(server);
    registerProcessLogTools(server);
    registerGrepLogsTools(server);
    registerProcmCommandsTools(server);

    installSignalHandlers({ onStdinClose: true });

    // Optional HTTP dashboard (enabled via PROCM_HTTP_PORT), overridden by --port.
    if (Number.isFinite(cli.port) && cli.port > 0) {
      startHttpServer(cli.port);
    } else {
      startHttpServerIfConfigured();
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);

    serverLog(`Server started with ID: ${serverId}, PID: ${process.pid}.`);
  }
} catch (error) {
  serverLog(`Error starting server: ${toErrorMessage(error)}`);
  exitProcess(1);
}

// Install process-wide signal handlers. cleanup() is idempotent, so calling it
// from multiple handlers is safe. `onStdinClose` only applies to stdio MCP mode,
// where a closed stdin (e.g. the client disconnecting) means the server should exit.
function installSignalHandlers(opts: { onStdinClose?: boolean } = {}) {
  process.on("beforeExit", async () => {
    serverLog("Server is exiting, cleaning up processes...");
    await cleanup();
  });

  process.on("SIGINT", async () => {
    serverLog("Server received SIGINT, cleaning up processes...");
    await cleanup();
    exitProcess(0);
  });

  process.on("SIGTERM", async () => {
    serverLog("Server received SIGTERM, cleaning up processes...");
    await cleanup();
    exitProcess(0);
  });

  process.on("uncaughtException", async (error) => {
    serverLog(`Uncaught exception: ${toErrorMessage(error)}`);
    await cleanup();
    exitProcess(1);
  });

  if (opts.onStdinClose) {
    process.stdin.on("close", async () => {
      serverLog("Server stdin closed, cleaning up processes...");
      await cleanup();
      exitProcess(0);
    });
  }
}

function exitProcess(code: number) {
  serverLog(`Exiting process with code: ${code}`);
  process.exit(code);
}
