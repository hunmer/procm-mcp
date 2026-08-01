import { ChildProcess, spawn } from "child_process";
import kill from "tree-kill";
import { nanoid } from "nanoid";
import {
  createProcessStdoutClient,
} from "./process-stdout-client.js";
import { toErrorMessage } from "./error.js";
import { serverLog, logServerId } from "./server-log.js";
import { dashboardEvents } from "./events.js";
import { ProcessMetadata, ProcessStatus } from "./types.js";
import path from "path";
import { ProcmMcpDir } from "./procm-mcp-dir.js";
import { mkdirp } from "mkdirp";
import {
  createProcessesRepository,
  type ProcessRecord,
  type ProcessesRepository,
} from "./processes-repository.js";

// Module-level singleton, shared by MCP tools and the HTTP dashboard.
const processes: ProcessMetadata[] = [];

// Durable store of process records (including stopped/exited ones) so the
// history survives backend restarts. Lazily initialized on first use; resolved
// before the first process is started (see `ensureRepository`).
let processesRepo: ProcessesRepository | null = null;
let processesRepoPromise: Promise<ProcessesRepository> | null = null;

async function ensureRepository(): Promise<ProcessesRepository> {
  if (processesRepo) return processesRepo;
  if (!processesRepoPromise) {
    processesRepoPromise = (async () => {
      // Use a stable path NOT scoped by serverId: process records must survive
      // backend restarts, and each restart gets a fresh serverId. (Logs are
      // per-instance by design, but the process history is global.)
      const dir = ProcmMcpDir();
      await mkdirp(dir);
      const filePath = path.join(dir, "processes.json");
      const repo = await createProcessesRepository(filePath);
      await repo.initialize();
      processesRepo = repo;
      return repo;
    })();
  }
  return processesRepoPromise;
}

// Check whether a PID still refers to a live process. Uses signal 0, which
// performs no actual signal delivery — it only probes liveness. Cross-platform:
// works on Windows too. ESRCH = no such process; any other throw (e.g. EPERM)
// implies the process exists but we lack permission, so treat it as alive.
function isPidAlive(pid: number | null | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

// On startup, reconcile persisted records left in the "running" state by a
// previous backend that exited without cleanup (crash / SIGKILL). For each such
// record: if its PID is still alive (an orphan), kill the tree; in either case
// mark the record exited so the dashboard no longer shows stale "running" rows.
// Idempotent and safe on an empty/clean store. Never throws — failures are
// logged so a storage hiccup can't block startup.
export async function reconcileStaleProcesses(): Promise<void> {
  try {
    const repo = await ensureRepository();
    const records = await repo.getAll();
    const stale = records.filter((r) => r.status === "running");
    if (stale.length === 0) return;

    serverLog(`Reconciling ${stale.length} stale running process record(s) from a previous run...`);
    const stoppedAt = Date.now();
    for (const r of stale) {
      const alive = isPidAlive(r.pid);
      if (alive && r.pid) {
        try {
          // tree-kill takes down the whole tree (e.g. cmd /c children on
          // Windows). We don't wait for exit at startup — the signal has been
          // sent and the record is marked exited regardless.
          await killTreeById(r.pid);
          serverLog(`Reconciled stale process ${r.name} (id=${r.id}, pid=${r.pid}): was still alive, killed.`);
        } catch (err) {
          serverLog(`Reconcile: failed to kill orphan ${r.name} (id=${r.id}, pid=${r.pid}): ${toErrorMessage(err)}. Marking exited anyway.`);
        }
      } else {
        serverLog(`Reconciled stale process ${r.name} (id=${r.id}, pid=${r.pid ?? "n/a"}): already dead.`);
      }
      await repo.upsert({ ...r, status: "exited", exitCode: null, stoppedAt });
    }
    dashboardEvents.emitProcessChange();
  } catch (err) {
    serverLog(`Error during stale process reconciliation: ${toErrorMessage(err)}`);
  }
}

// tree-kill wrapper that doesn't require a ProcessMetadata (used by reconcile
// where we only have a persisted record). On Windows SIGTERM is unsupported, so
// always use SIGKILL — consistent with killProcessTree above.
function killTreeById(pid: number, force = false): Promise<void> {
  const signal =
    process.platform === "win32" ? "SIGKILL" : force ? "SIGKILL" : "SIGTERM";
  return new Promise((resolve, reject) => {
    kill(pid, signal, (err) => (err ? reject(err) : resolve()));
  });
}

// Map an in-memory ProcessMetadata to its durable record shape. `stoppedAt`
// defaults to null — it's only set when the process is removed from the list.
function toRecord(meta: ProcessMetadata, stoppedAt: number | null = null): ProcessRecord {
  return {
    id: meta.id,
    name: meta.name,
    script: meta.script,
    args: meta.args,
    cwd: meta.cwd,
    status: meta.status,
    pid: meta.pid ?? null,
    exitCode: meta.exitCode,
    error: meta.error,
    desc: meta.desc,
    startedAt: startedAtByMeta.get(meta.id) ?? Date.now(),
    stoppedAt,
  };
}

// Track each process's original start time in memory so upsert() preserves it
// across status updates (the record's own startedAt is authoritative once
// persisted, but we need a value before the first write lands).
const startedAtByMeta = new Map<string, number>();

// When true, the allow-x (allow-start-process) gate is skipped for the
// start-process / start-procm-command tools. DANGEROUS: set only in trusted
// environments. Configured at startup from --allow-all / PROCM_ALLOW_ALL.
let allowAll = false;

export function setAllowAll(value: boolean) {
  allowAll = value;
}

export function isAllowAll(): boolean {
  return allowAll;
}

export function listProcesses(): ProcessMetadata[] {
  return processes;
}

// Return a merged view of live (in-memory) and historical (persisted) process
// records. Live processes take precedence over any stale persisted copy with
// the same id; everything else comes from the durable store so stopped/exited
// processes remain visible across restarts. Newest startedAt first.
export async function listProcessRecords(): Promise<ProcessRecord[]> {
  const repo = await ensureRepository();
  const persisted = await repo.getAll();
  const liveIds = new Set(processes.map((p) => p.id));
  const liveRecords = processes.map((m) => toRecord(m));
  // Drop persisted entries that are still live — the in-memory record wins.
  const historical = persisted.filter((p) => !liveIds.has(p.id));
  return [...liveRecords, ...historical].sort(
    (a, b) => b.startedAt - a.startedAt,
  );
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
  desc?: string | null,
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
        // Notify subscribers (e.g. the WebSocket broadcaster) that the process
        // list view has changed. Note: this only fires after the metadata
        // object is registered; pre-spawn changes are covered by pushProcess.
        dashboardEvents.emitProcessChange();
        // Persist the latest state so the record survives a restart.
        void persist(processMetadata);
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
      // Surface non-zero / unexpected exits to the console so an operator
      // watching the backend notices the crash, not just the dashboard.
      if (code !== 0) {
        const label = name || script;
        const msg = `Process "${label}" (ID: ${processId}) exited with code ${code}`;
        serverLog(msg);
        console.error(`procm-mcp: ${msg}`);
      }
      applyProcessState();
    });

    childProcess.on("error", (error) => {
      status = "error";
      processError = error.message;
      // Spawn/runtime failures (e.g. command not found) are surfaced to the
      // console so they aren't only visible in the dashboard's status tooltip.
      const label = name || script;
      const msg = `Process "${label}" (ID: ${processId}) error: ${toErrorMessage(error)}`;
      serverLog(msg);
      console.error(`procm-mcp: ${msg}`);
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
      desc: desc ? desc.trim() || null : null,
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
  startedAtByMeta.delete(id);
  // Mark the record as stopped but keep it persisted so it still shows up as a
  // historical/expired entry after a backend restart.
  void markStopped(processMetadata);
  dashboardEvents.emitProcessChange();
  return true;
}

// Mark a process record as stopped in the durable store. Like persist(), this
// is fire-and-forget — a failure here must not block the in-memory removal.
async function markStopped(meta: ProcessMetadata): Promise<void> {
  try {
    const repo = await ensureRepository();
    await repo.upsert({ ...toRecord(meta), stoppedAt: Date.now() });
  } catch (err) {
    serverLog(`Error marking process record stopped: ${toErrorMessage(err)}`);
  }
}

// Delete a process entirely: if it is still running, stop it first; then erase
// its persisted record so it no longer appears as history. Returns false only
// when neither a live process nor a stored record exists for the id.
export async function deleteProcess(id: string): Promise<boolean> {
  let removedLive = false;
  const idx = findProcessIndex(id);
  if (idx !== -1) {
    await killProcess(processes[idx]);
    processes.splice(idx, 1);
    startedAtByMeta.delete(id);
    removedLive = true;
  }
  // Erase the persisted record (whether it was live or already historical).
  let removedStored = false;
  try {
    const repo = await ensureRepository();
    removedStored = await repo.remove(id);
  } catch (err) {
    serverLog(`Error deleting process record: ${toErrorMessage(err)}`);
  }
  if (removedLive || removedStored) {
    dashboardEvents.emitProcessChange();
    return true;
  }
  return false;
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
    processMetadata.desc,
  );
  processes[processIndex] = newProcess;
  dashboardEvents.emitProcessChange();
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
  startedAtByMeta.set(metadata.id, Date.now());
  dashboardEvents.emitProcessChange();
  // Persist the initial record so a crash between spawn and the next state
  // change still leaves a trace.
  void persist(metadata);
}

// Persist a snapshot of a live process's state. Fire-and-forget: the in-memory
// list is the source of truth for the running dashboard; persistence only
// guarantees history survives a restart. Errors are logged, never thrown, so a
// storage hiccup can't break process lifecycle.
async function persist(meta: ProcessMetadata): Promise<void> {
  try {
    const repo = await ensureRepository();
    await repo.upsert(toRecord(meta));
  } catch (err) {
    serverLog(`Error persisting process record: ${toErrorMessage(err)}`);
  }
}
