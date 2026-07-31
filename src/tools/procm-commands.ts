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
  isAllowAll,
} from "../process-manager.js";
import { checkProcessCreationAllowed } from "../allowed-process-creations.js";

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

export function registerProcmCommandsTools(server: McpServer) {
  server.tool(
    "get-procm-commands",
    "Read procm-commands.json from the given project directory (defaults to the current working directory) and return its contents plus the list of available command names.",
    {
      cwd: z.string().optional(),
    },
    async ({ cwd = process.cwd() }) => {
      logToolStart("get-procm-commands", { cwd });

      try {
        const commandsFile = await readCommandsFile(cwd);
        if (!commandsFile) {
          return textResult(
            `No ${COMMANDS_FILE} found in ${cwd}. Create one with a top-level "commands" object, e.g. {"commands":{"dev":{"script":"npm","args":["run","dev"]}}}.`,
          );
        }

        const names = Object.keys(commandsFile.commands);
        logToolEnd("get-procm-commands", { cwd, count: names.length });

        return textResult(
          `${COMMANDS_FILE} in ${cwd}:\n\n${JSON.stringify(
            commandsFile,
            null,
            2,
          )}\n\nAvailable command names: ${
            names.length ? names.join(", ") : "(none)"
          }`,
        );
      } catch (error) {
        logToolError("get-procm-commands", error);
        return textResult(`Error reading commands: ${toErrorMessage(error)}`);
      }
    },
  );

  server.tool(
    "start-procm-command",
    "Start a process defined in procm-commands.json by name. Still subject to allow-x: the script/args/cwd must be allowed first via allow-start-process.",
    {
      name: z.string(),
      cwd: z.string().optional(),
    },
    async ({ name, cwd = process.cwd() }) => {
      logToolStart("start-procm-command", { name, cwd });

      try {
        const commandsFile = await readCommandsFile(cwd);
        if (!commandsFile) {
          return textResult(
            `No ${COMMANDS_FILE} found in ${cwd}.`,
          );
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
        const resolvedCwd = command.cwd
          ? path.resolve(cwd, command.cwd)
          : cwd;
        const envs = command.envs || {};

        const isAllowed =
          isAllowAll() ||
          (await checkProcessCreationAllowed({
            script: command.script,
            args,
            cwd: resolvedCwd,
          }));
        if (!isAllowed) {
          return textResult(
            `Process creation is not allowed for command "${name}" (script: ${command.script}, args: ${args.join(
              " ",
            )}, cwd: ${resolvedCwd}). Please allow it first using the allow-start-process tool.`,
          );
        }

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

        logToolEnd("start-procm-command", {
          id: processId,
          name,
          script: command.script,
          args,
          cwd: resolvedCwd,
        });

        return textResult(`Process started: ${name} (${cmd}, ID: ${processId})`);
      } catch (error) {
        logToolError("start-procm-command", error);
        return textResult(`Error starting command: ${toErrorMessage(error)}`);
      }
    },
  );
}
