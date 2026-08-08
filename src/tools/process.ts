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
} from "../process-manager.js";

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
      desc: z.string().optional(),
    },
    async ({ script, name, args = [], cwd = process.cwd(), envs = {}, desc }) => {
      logToolStart("start-process", {
        script,
        name,
        args,
        cwd,
        desc,
      });

      try {
        const validateScriptError = validateScript(script);
        if (validateScriptError) {
          return textResult(validateScriptError);
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
          desc,
        );
        pushProcess(startedProcess);

        logToolEnd("start-process", {
          id: processId,
          name: name || command,
          script,
          args: args || [],
          cwd,
          desc,
        });

        return textResult(`Process started: ${name || command} (ID: ${processId})`);
      } catch (error) {
        logToolError("start-process", error);
        return textResult(`Error starting process: ${toErrorMessage(error)}`);
      }
    },
  );

  // Unified process tool: get / delete / restart / list. start stays separate
  // (it has a different required-arg set: script/cwd/etc.). A single `action`
  // selects the operation; get/delete/restart need `id`, list ignores it.
  server.tool(
    "process",
    `Manage a process by ID, or list all processes.
- action "list": list all running processes (id ignored).
- action "get": show details of a process (requires id).
- action "delete": stop and remove a process by ID (requires id).
- action "restart": restart a process by ID (requires id).`,
    {
      action: z.enum(["get", "delete", "restart", "list"]),
      id: z.string().optional(),
    },
    async ({ action, id }) => {
      logToolStart("process", { action, id });

      try {
        // --- list -------------------------------------------------------
        if (action === "list") {
          const processes = listProcesses();
          if (processes.length === 0) {
            logToolEnd("process", { action: "list", count: 0 });
            return textResult("No processes are currently running.");
          }
          const lines = processes.map(
            (p) => `${p.id}: ${p.name} (${p.script} ${p.args.join(" ")})`,
          );
          logToolEnd("process", { action: "list", count: processes.length });
          return textResult(`Running processes:\n${lines.join("\n")}`);
        }

        // --- get / delete / restart all need an id ----------------------
        if (!id) {
          return textResult(
            `Action "${action}" requires an "id". Provide the process ID.`,
          );
        }

        if (action === "get") {
          const p = getProcess(id);
          if (!p) {
            return notFoundResult(id);
          }
          logToolEnd("process", { action: "get", id: p.id, name: p.name });
          return textResult(
            `Process ID: ${p.id}\n` +
              `Process PID: ${p.pid}\n` +
              `Name: ${p.name}\n` +
              `Script: ${p.script}\n` +
              `Arguments: ${p.args.join(" ")}\n` +
              `CWD: ${p.cwd}\n` +
              `Status: ${p.status}\n` +
              `Exit Code: ${p.exitCode ?? "N/A"}\n` +
              `Error: ${p.error ?? "N/A"}`,
          );
        }

        if (action === "delete") {
          const removed = await removeProcess(id);
          if (!removed) {
            return notFoundResult(id);
          }
          logToolEnd("process", { action: "delete", id });
          return textResult(`Process with ID ${id} has been deleted.`);
        }

        // action === "restart"
        const restarted = await restartProcess(id);
        if (!restarted) {
          return notFoundResult(id);
        }
        logToolEnd("process", { action: "restart", id });
        return textResult(`Process with ID ${id} has been restarted.`);
      } catch (error) {
        logToolError("process", error);
        return textResult(`Error in process tool: ${toErrorMessage(error)}`);
      }
    },
  );
}
