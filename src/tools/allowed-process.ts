import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import { logToolStart, logToolEnd, logToolError } from "../server-log.js";
import { toErrorMessage } from "../error.js";
import { validateScript } from "../process-manager.js";
import {
  allowProcessCreation,
  deleteAllowedProcessCreation,
  getAllowedProcesses,
} from "../allowed-process-creations.js";

// Unified allow-x tool: allow / delete / list the process-creation whitelist.
//   - allow / delete: require script (args/cwd optional, default to cwd).
//   - list: optional cwd filter.
export function registerAllowedProcessTools(server: McpServer) {
  server.tool(
    "allowed-process",
    `Manage the process-creation allow list (the allow-x gate that start-process / procm-command checks).
- action "allow": allow a specific script/args/cwd to be started without further confirmation (requires script).
- action "delete": remove an entry from the allow list (requires script).
- action "list": list allowed entries (optional cwd to filter to one directory).`,
    {
      action: z.enum(["allow", "delete", "list"]),
      script: z.string().optional(),
      args: z.array(z.string()).optional(),
      cwd: z.string().optional(),
    },
    async ({ action, script, args = [], cwd = process.cwd() }) => {
      logToolStart("allowed-process", { action, script, args, cwd });

      try {
        // --- list -------------------------------------------------------
        if (action === "list") {
          const allowed = await getAllowedProcesses();
          logToolEnd("allowed-process", { action: "list", count: allowed.length });
          return textResult(
            `Allowed processes:\n${allowed
              .filter((x) => x.cwd === cwd)
              .map((x) => `${x.script} ${x.args.join(" ")} in ${x.cwd}`)
              .join("\n")}`,
          );
        }

        // --- allow / delete both need a script --------------------------
        if (!script) {
          return textResult(
            `Action "${action}" requires a "script".`,
          );
        }

        const validateScriptError = validateScript(script);
        if (validateScriptError) {
          return textResult(validateScriptError);
        }

        if (action === "allow") {
          await allowProcessCreation({ script, args, cwd });
          logToolEnd("allowed-process", { action: "allow", script, args, cwd });
          return textResult(
            `Process creation allowed for script: ${script} with args: ${args.join(
              " ",
            )} in cwd: ${cwd}.`,
          );
        }

        // action === "delete"
        await deleteAllowedProcessCreation({ script, args, cwd });
        logToolEnd("allowed-process", { action: "delete", script, args, cwd });
        return textResult(
          `Allowed process deleted for script: ${script} with args: ${args.join(
            " ",
          )} in cwd: ${cwd}.`,
        );
      } catch (error) {
        logToolError("allowed-process", error);
        return textResult(
          `Error in allowed-process tool: ${toErrorMessage(error)}`,
        );
      }
    },
  );
}
