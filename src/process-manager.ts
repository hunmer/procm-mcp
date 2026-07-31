import { ChildProcess, spawn } from "child_process";
import kill from "tree-kill";
import { nanoid } from "nanoid";
import {
  createProcessStdoutClient,
} from "./process-stdout-client.js";
import { toErrorMessage } from "./error.js";
import { serverLog, logServerId } from "./server-log.js";
import { ProcessMetadata, ProcessStatus } from "./types.js";

// Module-level singleton, shared by MCP tools and the HTTP dashboard.
const processes: ProcessMetadata[] = [];

export function listProcesses(): ProcessMetadata[] {
  return processes;
}

export function getProcess(id: string): ProcessMetadata | undefined {
  return processes.find((p) => p.id === id);
}

export function findProcessIndex(id: string): number {
  return processes.findIndex((p) => p.id === id);
}

export function generateProcessId() {
  return nanoid(8);
}

// Validate the script name and return an error message string if invalid,
// otherwise null. Decoupled from MCP's CallToolResult so it can be reused
// by both MCP tools and the HTTP dashboard.
export function validateScript(script: string): string | null {
  if (script.includes(" ")) {
    return `Script name cannot contain spaces. Please split the command into script and args. In this case, script: "${
      script.split(" ")[0]
    }", args: ["${script.split(" ").slice(1).join('", "')}"]`;
  }

  if (script.includes("=")) {
    return `You seem to be trying to set an environment variable before a command. Please specify the environment variable in the "envs" field`;
  }

  return null;
}

export function createCommand(script: string, args: string[] | undefined): string {
  return [script, ...(args || [])].join(" ");
}

export async function startProcess(
  processId: string,
  script: string,
  name: string | undefined,
  args: string[] | undefined,
  cwd: string,
  envs: Record<string, string>,
): Promise<ProcessMetadata> {
  serverLog(
    `Starting process: ${name || script} with args: ${
      args?.join(" ") || ""
    } in cwd: ${cwd}`,
  );

  try {
    const command = createCommand(script, args);

    const childProcess = spawn(script, args || [], {
      cwd,
      env: {
        ...process.env,
        ...envs,
      },
    });

    let processMetadata: ProcessMetadata | null = null;
    let status: ProcessStatus = "spawning";
    let pid = childProcess.pid;
    let exitCode: number | null = null;
    let processError: string | null = null;

    const applyProcessState = () => {
      if (processMetadata) {
        processMetadata.status = status;
        processMetadata.pid = pid;
        processMetadata.exitCode = exitCode;
        processMetadata.error = processError;
      }
    };

    childProcess.on("spawn", () => {
      status = "running";
      pid = childProcess.pid;
      applyProcessState();
    });

    childProcess.on("exit", (code) => {
      status = "exited";
      exitCode = code;
      applyProcessState();
    });

    childProcess.on("error", (error) => {
      status = "error";
      processError = error.message;
      applyProcessState();
    });

    const [stdoutClient, stderrClient] = await Promise.all([
      await createProcessStdoutClient({
        id: processId,
        type: "stdout",
        readable: childProcess.stdout,
        serverId: logServerId,
      }),
      await createProcessStdoutClient({
        id: processId,
        type: "stderr",
        readable: childProcess.stderr,
        serverId: logServerId,
      }),
    ]);

    serverLog(
      `Process started: ${name || script} with args: ${
        args?.join(" ") || ""
      } in cwd: ${cwd}`,
    );

    processMetadata = {
      id: processId,
      pid,
      name: name || command,
      script,
      args: args || [],
      cwd,
      envs,
      status,
      error: processError,
      exitCode,
      process: childProcess,
      stdoutClient,
      stderrClient,
    };
    return processMetadata;
  } catch (error) {
    serverLog(`Error starting process: ${name || script} - ${error}`);
    throw error;
  }
}

// Stop a process but leave its metadata in the list (used by restart).
export async function killProcess(processMetadata: ProcessMetadata) {
  serverLog(
    `Killing process: ${processMetadata.name} (ID: ${processMetadata.id})`,
  );

  try {
    const pid = processMetadata.process.pid;
    if (pid) {
      const processExited = new Promise<void>((resolve) => {
        const onExit = () => {
          clearTimeout(forceKillTimeoutId);
          serverLog(
            `Process exited: ${processMetadata.name} (ID: ${processMetadata.id})`,
          );
          resolve();
        };
        const forceKillTimeoutId = setTimeout(() => {
          processMetadata.process.off("exit", onExit);

          serverLog(
            `Process did not exit in time, force killing: ${processMetadata.name} (ID: ${processMetadata.id})`,
          );
          killProcessTree(pid, processMetadata, true);

          resolve();
        }, 10 * 1000);
        processMetadata.process.on("exit", onExit);
      });

      await killProcessTree(pid, processMetadata);

      await processExited;

      await Promise.all([
        processMetadata.stdoutClient.close(),
        processMetadata.stderrClient.close(),
      ]);
    } else {
      serverLog(
        `Process with ID ${processMetadata.id} has no PID, cannot kill.`,
      );
    }
  } catch (error) {
    serverLog(
      `Error killing process: ${processMetadata.name} (ID: ${processMetadata.id}) - ${error}`,
    );
    throw error;
  }
}

// Stop and remove a process from the list.
export async function removeProcess(id: string): Promise<boolean> {
  const processIndex = findProcessIndex(id);
  if (processIndex === -1) {
    return false;
  }
  const processMetadata = processes[processIndex];

  await killProcess(processMetadata);
  processes.splice(processIndex, 1);
  return true;
}

// Restart an existing process, preserving its id and position in the list.
export async function restartProcess(id: string): Promise<ProcessMetadata | null> {
  const processIndex = findProcessIndex(id);
  if (processIndex === -1) {
    return null;
  }
  const processMetadata = processes[processIndex];

  await killProcess(processMetadata);

  const newProcess = await startProcess(
    id,
    processMetadata.script,
    processMetadata.name,
    processMetadata.args,
    processMetadata.cwd,
    processMetadata.envs,
  );
  processes[processIndex] = newProcess;
  return newProcess;
}

// Cleanup all processes. Safe to call multiple times — subsequent calls are no-ops.
let cleanupped: Promise<void> | undefined;
export function cleanup(): Promise<void> {
  if (cleanupped) {
    return cleanupped;
  }
  cleanupped = doCleanup();
  return cleanupped;
}

async function doCleanup() {
  serverLog("Cleaning up all processes...");

  try {
    // Kill all child processes
    await Promise.all(
      processes.map((processMetadata) => killProcess(processMetadata)),
    );

    serverLog("All processes cleaned up successfully.");
  } catch (error) {
    serverLog(`Error during cleanup: ${toErrorMessage(error)}`);
    throw error;
  }
}

async function killProcessTree(
  pid: number,
  processMetadata: ProcessMetadata,
  force = false,
): Promise<void> {
  // On Windows, SIGTERM is not supported — always use SIGKILL which maps to
  // `taskkill /T /F` in tree-kill, ensuring cmd /c child processes are also terminated.
  const signal =
    process.platform === "win32" ? "SIGKILL" : force ? "SIGKILL" : "SIGTERM";

  return new Promise<void>((resolve, reject) => {
    kill(pid, signal, async (err) => {
      if (err) {
        serverLog(
          `Error killing process: ${processMetadata.name} (ID: ${processMetadata.id}) - ${err}`,
        );
        reject(err);
      } else {
        serverLog(
          `Process killed successfully: ${processMetadata.name} (ID: ${processMetadata.id})`,
        );
        resolve();
      }
    });
  });
}

// Internal helper for pushing a freshly started process onto the list.
export function pushProcess(metadata: ProcessMetadata) {
  processes.push(metadata);
}
