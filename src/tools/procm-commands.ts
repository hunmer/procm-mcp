import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { textResult } from "../tool-helpers.js";
import { logToolStart, logToolEnd, logToolError } from "../server-log.js";
import { toErrorMessage } from "../error.js";
import {
  validateScript,
  createCommand,
  generateProcessId,
  startProcess,
  pushProcess,
} from "../process-manager.js";

export const COMMANDS_FILE = "procm-commands.json";

export type ProcmCommand = {
  script: string;
  args?: string[];
  cwd?: string;
  envs?: Record<string, string>;
  desc?: string;
};

export type ProcmCommandsFile = {
  commands: Record<string, ProcmCommand>;
};

async function readCommandsFile(
  projectDir: string,
): Promise<ProcmCommandsFile | null> {
  const filePath = path.join(projectDir, COMMANDS_FILE);
  const json = await fs.readFile(filePath, { encoding: "utf8" }).catch((e) => {
    if (e.code === "ENOENT") {
      return null;
    }
    throw e;
  });
  if (json === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(
      `${COMMANDS_FILE} in ${projectDir} is not valid JSON: ${toErrorMessage(e)}`,
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as any).commands !== "object" ||
    (parsed as any).commands === null
  ) {
    throw new Error(
      `${COMMANDS_FILE} in ${projectDir} must have a "commands" object.`,
    );
  }
  return parsed as ProcmCommandsFile;
}

// Unified procm-command tool: list the commands defined in procm-commands.json
// or start one by name.
export function registerProcmCommandsTools(server: McpServer) {
  server.tool(
    "procm-command",
    `Manage processes defined in procm-commands.json (in the project directory, defaults to the current working directory).
- action "list": read the file and return its contents plus the available command names.
- action "start": start a command by name (requires name).`,
    {
      action: z.enum(["list", "start"]),
      name: z.string().optional(),
      cwd: z.string().optional(),
    },
    async ({ action, name, cwd = process.cwd() }) => {
      logToolStart("procm-command", { action, name, cwd });

      try {
        // --- list -------------------------------------------------------
        if (action === "list") {
          const commandsFile = await readCommandsFile(cwd);
          if (!commandsFile) {
            return textResult(
              `No ${COMMANDS_FILE} found in ${cwd}. Create one with a top-level "commands" object, e.g. {"commands":{"dev":{"script":"npm","args":["run","dev"]}}}.`,
            );
          }
          const names = Object.keys(commandsFile.commands);
          logToolEnd("procm-command", { action: "list", cwd, count: names.length });
          return textResult(
            `${COMMANDS_FILE} in ${cwd}:\n\n${JSON.stringify(
              commandsFile,
              null,
              2,
            )}\n\nAvailable command names: ${
              names.length ? names.join(", ") : "(none)"
            }`,
          );
        }

        // --- start ------------------------------------------------------
        if (!name) {
          return textResult(`Action "start" requires a "name".`);
        }

        const commandsFile = await readCommandsFile(cwd);
        if (!commandsFile) {
          return textResult(`No ${COMMANDS_FILE} found in ${cwd}.`);
        }

        const command = commandsFile.commands[name];
        if (!command) {
          const available = Object.keys(commandsFile.commands);
          return textResult(
            `Command "${name}" not found in ${COMMANDS_FILE}. Available: ${
              available.length ? available.join(", ") : "(none)"
            }`,
          );
        }

        const validateScriptError = validateScript(command.script);
        if (validateScriptError) {
          return textResult(validateScriptError);
        }

        const args = command.args || [];
        // Resolve cwd relative to the project directory, fall back to it.
        const resolvedCwd = command.cwd ? path.resolve(cwd, command.cwd) : cwd;
        const envs = command.envs || {};

        const processId = generateProcessId();
        const cmd = createCommand(command.script, args);
        const startedProcess = await startProcess(
          processId,
          command.script,
          name,
          args,
          resolvedCwd,
          envs,
          command.desc,
        );
        pushProcess(startedProcess);

        logToolEnd("procm-command", {
          action: "start",
          id: processId,
          name,
          script: command.script,
          args,
          cwd: resolvedCwd,
        });

        return textResult(`Process started: ${name} (${cmd}, ID: ${processId})`);
      } catch (error) {
        logToolError("procm-command", error);
        return textResult(`Error in procm-command tool: ${toErrorMessage(error)}`);
      }
    },
  );
}
