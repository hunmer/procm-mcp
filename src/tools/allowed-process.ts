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

export function registerAllowedProcessTools(server: McpServer) {
  server.tool(
    "allow-start-process",
    "Allow process creation",
    {
      script: z.string(),
      args: z.array(z.string()).optional(),
      cwd: z.string().optional(),
    },
    async ({ script, args = [], cwd = process.cwd() }) => {
      logToolStart("allow-start-process", {
        script,
        args,
        cwd,
      });

      try {
        const validateScriptError = validateScript(script);
        if (validateScriptError) {
          return textResult(validateScriptError);
        }

        await allowProcessCreation({
          script,
          args,
          cwd,
        });

        logToolEnd("allow-start-process", {
          script,
          args,
          cwd,
        });

        return textResult(
          `Process creation allowed for script: ${script} with args: ${args.join(
            " ",
          )} in cwd: ${cwd}.`,
        );
      } catch (error) {
        logToolError("allow-start-process", error);
        return textResult(
          `Error allowing process creation: ${toErrorMessage(error)}`,
        );
      }
    },
  );

  // list allowed processes
  server.tool(
    "list-allowed-processes-in-cwd",
    "List allowed processes in current working directory",
    {
      cwd: z.string().optional(),
    },
    async ({ cwd = process.cwd() }) => {
      try {
        logToolStart("list-allowed-processes", {});

        const allowedProcesses = await getAllowedProcesses();
        return textResult(
          `Allowed processes:\n${allowedProcesses
            .filter((x) => x.cwd === cwd)
            .map((x) => `${x.script} ${x.args.join(" ")} in ${x.cwd}`)
            .join("\n")}`,
        );
      } catch (error) {
        logToolError("list-allowed-processes", error);
        return textResult(
          `Error listing allowed processes: ${toErrorMessage(error)}`,
        );
      } finally {
        logToolEnd("list-allowed-processes", {});
      }
    },
  );

  // delete allowed process
  server.tool(
    "delete-allowed-process",
    "Delete an allowed process",
    {
      script: z.string(),
      args: z.array(z.string()).optional(),
      cwd: z.string().optional(),
    },
    async ({ script, args = [], cwd = process.cwd() }) => {
      try {
        logToolStart("delete-allowed-process", {
          script,
          args,
          cwd,
        });

        const validateScriptError = validateScript(script);
        if (validateScriptError) {
          return textResult(validateScriptError);
        }

        await deleteAllowedProcessCreation({
          script,
          args,
          cwd,
        });

        return textResult(
          `Allowed process deleted for script: ${script} with args: ${args.join(
            " ",
          )} in cwd: ${cwd}.`,
        );
      } catch (error) {
        logToolError("delete-allowed-process", error);
        return textResult(
          `Error deleting allowed process: ${toErrorMessage(error)}`,
        );
      } finally {
        logToolEnd("delete-allowed-process", {
          script,
          args,
          cwd,
        });
      }
    },
  );
}
