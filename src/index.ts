#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toErrorMessage } from "./error.js";
import { serverLog, serverId } from "./server-log.js";
import { cleanup, reconcileStaleProcesses } from "./process-manager.js";
import {
  startHttpServer,
  startHttpServerIfConfigured,
} from "./http-server.js";
import { registerProcessTools } from "./tools/process.js";
import { registerProcessLogTools } from "./tools/process-logs.js";
import { registerProcessLogFileTools } from "./tools/process-log-files.js";
import { registerProcessInputTools } from "./tools/process-input.js";
import { registerProcmCommandsTools } from "./tools/procm-commands.js";
import { registerRoomTools } from "./tools/room.js";
import { registerTraceTools } from "./tools/trace.js";
import { closeTraceStore } from "./trace-store.js";
import { isClientCommand, runClient, clientHelp } from "./cli-client.js";
import { ProcmGlobalDir } from "./procm-mcp-dir.js";
import path from "path";

const DEFAULT_SERVER_PORT = 7331;

// Minimal CLI flag parsing. Supports:
//   --server            Run as an HTTP-only backend (no MCP stdio transport)
//   --port <number>     Dashboard port (with --server, client --port, or override PROCM_HTTP_PORT)
//   --data-path <path>  Override the persistent data directory
// Client subcommands (ps/info/logs/grep/start/restart/stop/ping) are detected
// separately and connect to a running backend instead of starting one.
function parseArgs(argv: string[]) {
  const flags = { server: false, port: NaN as number, dataPath: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--server") {
      flags.server = true;
    } else if (a === "--port") {
      flags.port = Number(argv[i + 1]);
      i++;
    } else if (a.startsWith("--port=")) {
      flags.port = Number(a.slice("--port=".length));
    } else if (a === "--data-path") {
      flags.dataPath = argv[i + 1] ?? "";
      i++;
    } else if (a.startsWith("--data-path=")) {
      flags.dataPath = a.slice("--data-path=".length);
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        [
          "Usage: procm-mcp [--server] [--port <number>] [--data-path <path>]",
          "       procm-mcp <client-command> [args] [--port <n>] [--token <t>]",
          "",
          "Modes:",
          "  (default)         MCP server over stdio. Optional HTTP dashboard if PROCM_HTTP_PORT is set.",
          "  --server          HTTP-only backend: no MCP stdio transport, dashboard always starts.",
          "",
          "Options:",
          "  --port <number>   Dashboard port (default: 7331, or PROCM_HTTP_PORT).",
          "  --data-path <path>  Data directory (default: current working directory; use 'global' for ~/.procm-mcp).",
          "  -h, --help        Show this help.",
        ].join("\n") + "\n",
      );
      process.stdout.write("\n" + clientHelp() + "\n");
      process.exit(0);
    }
  }
  return flags;
}

try {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.dataPath !== undefined) {
    if (!cli.dataPath.trim()) {
      console.error("procm-mcp: --data-path requires a non-empty path.");
      exitProcess(1);
    }
    process.env.PROCM_MCP_DIR =
      cli.dataPath.trim().toLowerCase() === "global"
        ? ProcmGlobalDir()
        : path.resolve(cli.dataPath);
  }

  // Client mode: if the first positional arg is a client command (ps/info/...),
  // connect to a running backend over HTTP and run it, then exit. This does NOT
  // start a backend, so it takes precedence over --server / stdio modes.
  const firstPositional = process.argv
    .slice(2)
    .find((a) => !a.startsWith("-") || a === "-");
  if (isClientCommand(firstPositional)) {
    await runClient(process.argv.slice(2));
    exitProcess(0);
  }

  // --server: run as a standalone HTTP backend (no MCP stdio transport).
  // The dashboard is always started; the process stays alive to serve it.
  if (cli.server) {
    const port =
      Number.isFinite(cli.port) && cli.port > 0
        ? cli.port
        : Number(process.env.PROCM_HTTP_PORT) || DEFAULT_SERVER_PORT;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      serverLog(`Invalid port "${port}".`);
      console.error(`procm-mcp: invalid port "${port}".`);
      exitProcess(1);
    }

    // Reconcile any "running" records left behind by a previous backend that
    // exited without cleanup (crash/SIGKILL): kill orphan PIDs and mark them
    // exited before the dashboard starts serving.
    await reconcileStaleProcesses();

    await startHttpServer(port);
    consoleBanner(
      `procm-mcp backend (HTTP) ready`,
      `Dashboard: http://127.0.0.1:${port}  (PID ${process.pid})`,
    );
    serverLog(
      `Server started with ID: ${serverId}, PID: ${process.pid} (HTTP backend mode on port ${port}).`,
    );
    installSignalHandlers();
  } else {
    const server = new McpServer({
      name: "procm-mcp",
      version: "1.0.0",
    });

    registerProcessTools(server);
    registerProcessLogTools(server);
    registerProcessLogFileTools(server);
    registerProcessInputTools(server);
    registerProcmCommandsTools(server);
    registerRoomTools(server);
    registerTraceTools(server);

    // Reconcile stale "running" records from a prior crashed backend before
    // the dashboard (if any) starts serving. Same rationale as --server mode.
    await reconcileStaleProcesses();

    installSignalHandlers({ onStdinClose: true });

    // Optional HTTP dashboard (enabled via PROCM_HTTP_PORT), overridden by --port.
    if (Number.isFinite(cli.port) && cli.port > 0) {
      await startHttpServer(cli.port);
      consoleBanner(
        `procm-mcp dashboard ready`,
        `Dashboard: http://127.0.0.1:${cli.port}`,
      );
    } else {
      const httpServer = await startHttpServerIfConfigured();
      if (httpServer) {
        consoleBanner(
          `procm-mcp dashboard ready`,
          `Dashboard: http://127.0.0.1:${process.env.PROCM_HTTP_PORT}`,
        );
      }
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);

    serverLog(`Server started with ID: ${serverId}, PID: ${process.pid}.`);
  }
} catch (error) {
  serverLog(`Error starting server: ${toErrorMessage(error)}`);
  // Surface startup errors to the console (e.g. port in use) so they aren't
  // only buried in the log file.
  console.error(`procm-mcp: ${toErrorMessage(error)}`);
  exitProcess(1);
}

// Install process-wide signal handlers. cleanup() is idempotent, so calling it
// from multiple handlers is safe. `onStdinClose` only applies to stdio MCP mode,
// where a closed stdin (e.g. the client disconnecting) means the server should exit.
function installSignalHandlers(opts: { onStdinClose?: boolean } = {}) {
  process.on("beforeExit", async () => {
    serverLog("Server is exiting, cleaning up processes...");
    await cleanup();
    await closeTraceStore();
  });

  process.on("SIGINT", async () => {
    serverLog("Server received SIGINT, cleaning up processes...");
    await cleanup();
    await closeTraceStore();
    exitProcess(0);
  });

  process.on("SIGTERM", async () => {
    serverLog("Server received SIGTERM, cleaning up processes...");
    await cleanup();
    await closeTraceStore();
    exitProcess(0);
  });

  process.on("uncaughtException", async (error) => {
    serverLog(`Uncaught exception: ${toErrorMessage(error)}`);
    await cleanup();
    await closeTraceStore();
    exitProcess(1);
  });

  if (opts.onStdinClose) {
    process.stdin.on("close", async () => {
      serverLog("Server stdin closed, cleaning up processes...");
      await cleanup();
      await closeTraceStore();
      exitProcess(0);
    });
  }
}

function exitProcess(code: number) {
  serverLog(`Exiting process with code: ${code}`);
  process.exit(code);
}

// Print a short banner to the console so an operator can see the server is up
// and where to reach it. Goes to stderr to keep stdout clean (stdio MCP mode
// reserves stdout for the protocol).
function consoleBanner(title: string, detail: string) {
  console.error(`\n  ${title}\n  ${detail}\n`);
}
