import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult, notFoundResult } from "../tool-helpers.js";
import { logToolStart, logToolEnd, logToolError } from "../server-log.js";
import { toErrorMessage } from "../error.js";
import {
  validateScript,
  createCommand,
  generateProcessId,
  startProcess,
  removeProcess,
  restartProcess,
  getProcess,
  listProcesses,
  pushProcess,
  isAllowAll,
} from "../process-manager.js";
import { checkProcessCreationAllowed } from "../allowed-process-creations.js";

export function registerProcessTools(server: McpServer) {
  server.tool(
    "start-process",
    `Start a new process.
Warning: Do not invoke background processes that will not exit automatically, and stdout/stderr will not be captured.`,
    {
      script: z.string(),
      name: z.string().optional(),
      args: z.array(z.string()).optional(),
      cwd: z.string(),
      envs: z.record(z.string()).optional(),
    },
    async ({ script, name, args = [], cwd = process.cwd(), envs = {} }) => {
      logToolStart("start-process", {
        script,
        name,
        args,
        cwd,
      });

      try {
        const validateScriptError = validateScript(script);
        if (validateScriptError) {
          return textResult(validateScriptError);
        }

        const isAllowed =
          isAllowAll() ||
          (await checkProcessCreationAllowed({
            script,
            args: args,
            cwd: cwd,
          }));
        if (!isAllowed) {
          return textResult(
            `Process creation is not allowed for script: ${script} with args: ${args.join(
              " ",
            )} in cwd: ${cwd}. Please allow it first using the allow-start-process tool.`,
          );
        }

        const processId = generateProcessId();
        const command = createCommand(script, args);
        const startedProcess = await startProcess(
          processId,
          script,
          name,
          args,
          cwd,
          envs,
        );
        pushProcess(startedProcess);

        logToolEnd("start-process", {
          id: processId,
          name: name || command,
          script,
          args: args || [],
          cwd,
        });

        return textResult(`Process started: ${name || command} (ID: ${processId})`);
      } catch (error) {
        logToolError("start-process", error);
        return textResult(`Error starting process: ${toErrorMessage(error)}`);
      }
    },
  );

  server.tool(
    "delete-process",
    "Delete a process by ID",
    {
      id: z.string(),
    },
    async ({ id }) => {
      logToolStart("delete-process", { id });

      try {
        const removed = await removeProcess(id);
        if (!removed) {
          return notFoundResult(id);
        }

        logToolEnd("delete-process", { id });

        return textResult(`Process with ID ${id} has been deleted.`);
      } catch (error) {
        logToolError("delete-process", error);
        return textResult(`Error deleting process: ${toErrorMessage(error)}`);
      }
    },
  );

  server.tool(
    "restart-process",
    "Restart a process by ID",
    {
      id: z.string(),
    },
    async ({ id }) => {
      logToolStart("restart-process", { id });

      try {
        const restarted = await restartProcess(id);
        if (!restarted) {
          return notFoundResult(id);
        }

        logToolEnd("restart-process", { id });

        return textResult(`Process with ID ${id} has been restarted.`);
      } catch (error) {
        logToolError("restart-process", error);
        return textResult(`Error restarting process: ${toErrorMessage(error)}`);
      }
    },
  );

  server.tool(
    "get-process-info",
    "Get information about a process by ID",
    {
      id: z.string(),
    },
    async ({ id }) => {
      logToolStart("get-process-info", { id });

      try {
        const processMetadata = getProcess(id);
        if (!processMetadata) {
          return notFoundResult(id);
        }

        logToolEnd("get-process-info", {
          id: processMetadata.id,
          name: processMetadata.name,
        });

        return textResult(
          `Process ID: ${processMetadata.id}\n` +
            `Process PID: ${processMetadata.pid}\n` +
            `Name: ${processMetadata.name}\n` +
            `Script: ${processMetadata.script}\n` +
            `Arguments: ${processMetadata.args.join(" ")}\n` +
            `CWD: ${processMetadata.cwd}\n` +
            `Status: ${processMetadata.status}\n` +
            `Exit Code: ${processMetadata.exitCode ?? "N/A"}\n` +
            `Error: ${processMetadata.error ?? "N/A"}`,
        );
      } catch (error) {
        logToolError("get-process-info", error);
        return textResult(`Error getting process info: ${toErrorMessage(error)}`);
      }
    },
  );

  server.tool("list-processes", "List all running processes", {}, async () => {
    logToolStart("list-processes", {});

    try {
      const processes = listProcesses();
      if (processes.length === 0) {
        return textResult("No processes are currently running.");
      }
      const processList = processes.map((p) => ({
        id: p.id,
        name: p.name,
        command: `${p.script} ${p.args.join(" ")}`,
      }));

      logToolEnd("list-processes", { count: processList.length });

      return textResult(
        `Running processes:\n${processList
          .map((p) => `${p.id}: ${p.name} (${p.command})`)
          .join("\n")}`,
      );
    } catch (error) {
      logToolError("list-processes", error);
      return textResult(`Error listing processes: ${toErrorMessage(error)}`);
    }
  });
}
