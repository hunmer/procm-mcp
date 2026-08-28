import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { saveProcessRecord } from "../process-manager.js";
import { clearProcessLogs } from "../process-log-files.js";
import { pickDirectory } from "../native-directory.js";
import { textResult } from "../tool-helpers.js";
import { toErrorMessage } from "../error.js";
import { dashboardEvents } from "../events.js";

export function registerApiOperationTools(server: McpServer): void {
  server.tool("clear-process-logs", "Clear stdout and stderr history for a process.", { id: z.string().min(1) }, async ({ id }) => {
    try {
      if (!await clearProcessLogs(id)) return textResult(JSON.stringify({ error: "Process not found" }));
      dashboardEvents.emitLogClear(id);
      return textResult(JSON.stringify({ id, cleared: true }));
    } catch (error) {
      return textResult(JSON.stringify({ error: toErrorMessage(error) }));
    }
  });

  server.tool("import-process-batch", "Import multiple process configurations.", {
    items: z.array(z.object({ script: z.string(), args: z.array(z.string()), cwd: z.string(), name: z.string().optional(), desc: z.string().optional() })).min(1),
    group: z.string().optional(),
  }, async ({ items, group }) => {
    try {
      const imported = [];
      for (const item of items) {
        const saved = await saveProcessRecord({ ...item, favorite: true, group: group?.trim() || null });
        imported.push({ id: saved.id, name: saved.name, favorite: true });
      }
      return textResult(JSON.stringify({ imported }, null, 2));
    } catch (error) {
      return textResult(JSON.stringify({ error: toErrorMessage(error) }));
    }
  });

  server.tool("select-directory", "Open the native directory picker and return the selected path.", { title: z.string().optional() }, async () => {
    try {
      const selected = (await pickDirectory()).trim();
      return textResult(JSON.stringify(selected && selected !== "UserCancelled" ? { canceled: false, path: selected } : { canceled: true, path: null }));
    } catch (error) {
      return textResult(JSON.stringify({ error: toErrorMessage(error) }));
    }
  });
}
