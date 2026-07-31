import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult, notFoundResult } from "../tool-helpers.js";
import { logToolStart, logToolEnd, logToolError } from "../server-log.js";
import { toErrorMessage } from "../error.js";
import { getProcess } from "../process-manager.js";

export function registerProcessLogTools(server: McpServer) {
  server.tool(
    "get-process-stdout",
    "Get the stdout of a process by ID",
    {
      id: z.string(),
      chunkCount: z.number().optional(),
    },
    async ({ id, chunkCount = 10 }) => {
      logToolStart("get-process-stdout", { id, chunkCount });

      try {
        const processMetadata = getProcess(id);
        if (!processMetadata) {
          return notFoundResult(id);
        }
        const stdoutLogs = await processMetadata.stdoutClient.top(chunkCount);
        if (stdoutLogs.length === 0) {
          return textResult(`No stdout found for process with ID ${id}.`);
        }
        const stdout = stdoutLogs
          .map((log) => `[${log.timestamp.toISOString()}] ${log.message}`)
          .join("\n");

        logToolEnd("get-process-stdout", { id, chunkCount });

        return textResult(stdout);
      } catch (error) {
        logToolError("get-process-stdout", error);
        return textResult(`Error getting process stdout: ${toErrorMessage(error)}`);
      }
    },
  );

  server.tool(
    "get-process-stderr",
    "Get the stderr of a process by ID",
    {
      id: z.string(),
      chunkCount: z.number().optional(),
    },
    async ({ id, chunkCount = 10 }) => {
      logToolStart("get-process-stderr", { id, chunkCount });

      try {
        const processMetadata = getProcess(id);
        if (!processMetadata) {
          return notFoundResult(id);
        }

        const stderrLogs = await processMetadata.stderrClient.top(chunkCount);
        if (stderrLogs.length === 0) {
          return textResult(`No stderr logs found for process with ID ${id}.`);
        }

        const stderr = stderrLogs
          .map((log) => `[${log.timestamp.toISOString()}] ${log.message}`)
          .join("\n");

        logToolEnd("get-process-stderr", { id, chunkCount });

        return textResult(stderr);
      } catch (error) {
        logToolError("get-process-stderr", error);
        return textResult(`Error getting process stderr: ${toErrorMessage(error)}`);
      }
    },
  );
}
