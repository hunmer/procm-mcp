#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toErrorMessage } from "./error.js";
import { serverLog, serverId } from "./server-log.js";
import { cleanup } from "./process-manager.js";
import { startHttpServerIfConfigured } from "./http-server.js";
import { registerServerInfoTools } from "./tools/server-info.js";
import { registerAllowedProcessTools } from "./tools/allowed-process.js";
import { registerProcessTools } from "./tools/process.js";
import { registerProcessLogTools } from "./tools/process-logs.js";
import { registerGrepLogsTools } from "./tools/grep-logs.js";
import { registerProcmCommandsTools } from "./tools/procm-commands.js";

try {
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

  let cleanupped: Promise<void> | undefined;
  process.on("beforeExit", async () => {
    if (!cleanupped) {
      serverLog("Server is exiting, cleaning up processes...");

      // Clean up all processes before exiting
      cleanupped = cleanupped || cleanup();
      await cleanupped;
    }
  });

  process.on("SIGINT", async () => {
    serverLog("Server received SIGINT, cleaning up processes...");

    // Clean up all processes on interrupt signal
    cleanupped = cleanupped || cleanup();
    await cleanupped;
    exitProcess(0);
  });

  process.on("SIGTERM", async () => {
    serverLog("Server received SIGTERM, cleaning up processes...");

    // Clean up all processes on termination signal
    cleanupped = cleanupped || cleanup();
    await cleanupped;
    exitProcess(0);
  });

  process.on("uncaughtException", async (error) => {
    serverLog(`Uncaught exception: ${toErrorMessage(error)}`);
    // Clean up all processes on uncaught exception
    cleanupped = cleanupped || cleanup();
    await cleanupped;
    exitProcess(1);
  });

  process.stdin.on("close", async () => {
    serverLog("Server stdin closed, cleaning up processes...");
    // Clean up all processes when stdin is closed
    cleanupped = cleanupped || cleanup();
    await cleanupped;
    exitProcess(0);
  });

  // Optional HTTP dashboard (enabled via PROCM_HTTP_PORT).
  startHttpServerIfConfigured();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  serverLog(`Server started with ID: ${serverId}, PID: ${process.pid}.`);
} catch (error) {
  serverLog(`Error starting server: ${toErrorMessage(error)}`);
  exitProcess(1);
}

function exitProcess(code: number) {
  serverLog(`Exiting process with code: ${code}`);
  process.exit(code);
}
