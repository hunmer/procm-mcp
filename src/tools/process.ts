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

type StartInput = {
  script: string;
  name?: string;
  args?: string[];
  cwd: string;
  envs?: Record<string, string>;
  desc?: string;
  port?: number;
  roomId?: string;
  group?: string;
};

async function startManagedProcess(input: StartInput) {
  const error = validateScript(input.script);
  if (error) throw new Error(error);
  const processId = generateProcessId();
  const started = await startProcess(
    processId,
    input.script,
    input.name,
    input.args ?? [],
    input.cwd,
    input.envs ?? {},
    input.desc,
    input.port ?? null,
    input.roomId ?? null,
    input.group ?? null,
  );
  pushProcess(started);
  return started;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

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
      port: z.number().int().min(1).max(65535).optional(),
      roomId: z.string().min(1).optional(),
      group: z.string().min(1).optional(),
    },
    async ({ script, name, args = [], cwd = process.cwd(), envs = {}, desc, port, roomId, group }) => {
      logToolStart("start-process", {
        script,
        name,
        args,
        cwd,
        desc,
        port,
        roomId, group,
      });

      try {
        const startedProcess = await startManagedProcess({ script, name, args, cwd, envs, desc, port, roomId, group });
        const processId = startedProcess.id;
        const command = createCommand(script, args);

        logToolEnd("start-process", {
          id: processId,
          name: name || command,
          script,
          args: args || [],
          cwd,
          desc,
          port,
          roomId,
        });

        return textResult(`Process started: ${name || command} (ID: ${processId})`);
      } catch (error) {
        logToolError("start-process", error);
        return textResult(`Error starting process: ${toErrorMessage(error)}`);
      }
    },
  );

  server.tool(
    "batch-process",
    `Start or restart multiple processes with bounded concurrency. Returns one result per input in the original order; failures do not roll back successful items.`,
    {
      action: z.enum(["start", "restart"]),
      processes: z.array(z.object({
        script: z.string(),
        name: z.string().optional(),
        args: z.array(z.string()).optional(),
        cwd: z.string(),
        envs: z.record(z.string()).optional(),
        desc: z.string().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        roomId: z.string().min(1).optional(),
        group: z.string().min(1).optional(),
      })).max(100).optional(),
      ids: z.array(z.string().min(1)).max(100).optional(),
      concurrency: z.number().int().min(1).max(10).optional(),
    },
    async ({ action, processes: startInputs, ids, concurrency = 4 }) => {
      logToolStart("batch-process", { action, count: action === "start" ? startInputs?.length : ids?.length, concurrency });
      const inputs = action === "start" ? startInputs : ids;
      if (!inputs?.length) return textResult(`batch-process action "${action}" requires a non-empty ${action === "start" ? "processes" : "ids"} array.`);
      const results = action === "start"
        ? await mapLimit(startInputs!, concurrency, async (input, index) => {
            try {
              const started = await startManagedProcess(input);
              return { index, ok: true as const, id: started.id, name: started.name, roomId: started.roomId };
            } catch (error) {
              return { index, ok: false as const, error: toErrorMessage(error) };
            }
          })
        : await mapLimit(ids!, concurrency, async (id, index) => {
            try {
              const restarted = await restartProcess(id);
              return restarted
                ? { index, ok: true as const, id, name: restarted.name, roomId: restarted.roomId }
                : { index, ok: false as const, id, error: `Process ${id} not found` };
            } catch (error) {
              return { index, ok: false as const, id, error: toErrorMessage(error) };
            }
          });
      logToolEnd("batch-process", { action, succeeded: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length });
      return textResult(JSON.stringify({ action, results }, null, 2));
    },
  );

  // Unified process tool: get / delete / restart / list. start stays separate
  // (it has a different required-arg set: script/cwd/etc.). A single `action`
  // selects the operation; get/delete/restart need `id`, list ignores it.
  server.tool(
    "process",
    `Manage a process by ID, or list all processes.
- action "list": list processes, defaulting to running; optionally filter by status/group.
- action "get": show details of a process (requires id).
- action "delete": stop and remove a process by ID (requires id).
- action "restart": restart a process by ID (requires id).`,
    {
      action: z.enum(["get", "delete", "restart", "list"]),
      id: z.string().optional(),
      status: z.enum(["running", "spawning", "exited", "error", "all"]).optional(),
      group: z.string().min(1).optional(),
    },
    async ({ action, id, status = "running", group }) => {
      logToolStart("process", { action, id, status, group });

      try {
        // --- list -------------------------------------------------------
        if (action === "list") {
          const processes = listProcesses().filter((p) =>
            (status === "all" || p.status === status) &&
            (!group || p.group === group.trim()),
          );
          if (processes.length === 0) {
            logToolEnd("process", { action: "list", count: 0 });
            return textResult("No processes are currently running.");
          }
          const lines = processes.map(
            (p) => `${p.id}: ${p.name} [${p.status}${p.group ? `, group=${p.group}` : ""}] (${p.script} ${p.args.join(" ")})`,
          );
          logToolEnd("process", { action: "list", count: processes.length });
          const heading = status === "running" && !group
            ? "Running processes"
            : `Processes (status=${status}${group ? `, group=${group}` : ""})`;
          return textResult(`${heading}:\n${lines.join("\n")}`);
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
              `Group: ${p.group ?? "N/A"}\n` +
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
