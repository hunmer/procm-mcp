import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import { toErrorMessage } from "../error.js";
import { getProcessLogPaths, listProcessLogFiles } from "../process-log-files.js";

function response(value: unknown) {
  return textResult(JSON.stringify(value, null, 2));
}

export function registerProcessLogFileTools(server: McpServer): void {
  server.tool(
    "process-log-files",
    "Return the absolute stdout and stderr log file paths for a process, including historical processes.",
    { id: z.string().min(1) },
    async ({ id }) => {
      try {
        const paths = await getProcessLogPaths(id);
        return paths ? response({ id, ...paths }) : response({ ok: false, error: `Process ${id} not found` });
      } catch (error) {
        return response({ ok: false, error: toErrorMessage(error) });
      }
    },
  );

  server.tool(
    "log-files",
    "List historical process log files with absolute paths, newest first.",
    {
      processId: z.string().min(1).optional(),
      stream: z.enum(["stdout", "stderr"]).optional(),
      limit: z.number().int().min(1).max(5000).optional(),
    },
    async ({ processId, stream, limit }) => {
      try {
        let files = await listProcessLogFiles();
        if (processId) files = files.filter((file) => file.processId === processId);
        if (stream) files = files.filter((file) => file.stream === stream);
        return response({ files: files.slice(0, limit ?? 500) });
      } catch (error) {
        return response({ ok: false, error: toErrorMessage(error) });
      }
    },
  );
}
