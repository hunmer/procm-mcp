import { ChildProcess, spawn } from "child_process";
import kill from "tree-kill";
import { nanoid } from "nanoid";
import {
  createProcessStdoutClient,
  type ProcessStdoutClient,
} from "./process-stdout-client.js";
import { toErrorMessage } from "./error.js";
import { serverLog, logServerId } from "./server-log.js";
import { dashboardEvents } from "./events.js";
import { ProcessMetadata, ProcessStatus } from "./types.js";
import { getConnectionEnv } from "./connection-config.js";
import { ensureRoom, removeProcessFromRooms } from "./room-repository.js";
import path from "path";
import { existsSync } from "fs";
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
      // A procm backend can itself be managed by another procm instance. Both
      // use the same durable store, so the inner backend may see the outer
      // manager's record for its own PID during startup. Never reconcile (and
      // therefore kill) the current process.
      if (r.pid === process.pid) {
        serverLog(`Reconcile: skipping current backend process record ${r.name} (id=${r.id}, pid=${r.pid}).`);
        continue;
      }
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
    group: meta.group,
    port: meta.port,
    roomId: meta.roomId,
    favorite: meta.favorite,
    startedAt: startedAtByMeta.get(meta.id) ?? Date.now(),
    // lastStartedAt falls back to startedAt so a record that predates this
    // field (or a process that never restarted) still has a sensible value.
    lastStartedAt: lastStartedAtByMeta.get(meta.id) ?? startedAtByMeta.get(meta.id) ?? Date.now(),
    stoppedAt,
    // Persist the on-disk log paths so a stopped/expired process's logs stay
    // viewable/downloadable after its in-memory clients are gone (and across
    // backend restarts, since the paths are absolute under tmpdir).
    stdoutLogPath: meta.stdoutClient.textFilePath,
    stderrLogPath: meta.stderrClient.textFilePath,
    // Persist envs so a stopped process can be fully restored on restart.
    envs: meta.envs,
  };
}

// Track each process's original start time in memory so upsert() preserves it
// across status updates (the record's own startedAt is authoritative once
// persisted, but we need a value before the first write lands).
const startedAtByMeta = new Map<string, number>();

// Track each process's MOST RECENT start time in memory so the dashboard can
// show "time since last restart". Unlike startedAt, this is reset on every
// restart (see restartProcess) and NOT preserved by upsert().
const lastStartedAtByMeta = new Map<string, number>();

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

// Persist the UI favorite flag for both live and historical records.
export async function setProcessFavorite(id: string, favorite: boolean): Promise<boolean> {
  const live = getProcess(id);
  if (live) {
    live.favorite = favorite;
    await persist(live);
    dashboardEvents.emitProcessChange();
    return true;
  }
  const repo = await ensureRepository();
  const record = await repo.getById(id);
  if (!record) return false;
  await repo.upsert({ ...record, favorite });
  dashboardEvents.emitProcessChange();
  return true;
}

// Merge user-edited fields into a live process and/or its durable record. Only
// the provided keys are applied; everything else keeps its current value.
// Editing a running process never restarts it — the new script/args/cwd/envs
// simply take effect the next time it is (re)started.
export type ProcessFieldUpdates = {
  name?: string;
  script?: string;
  args?: string[];
  cwd?: string;
  desc?: string | null;
  port?: number | null;
  envs?: Record<string, string>;
  group?: string | null;
};

export async function updateProcessFields(
  id: string,
  updates: ProcessFieldUpdates,
): Promise<boolean> {
  const live = getProcess(id);
  if (live) {
    if (updates.name !== undefined) live.name = updates.name;
    if (updates.script !== undefined) live.script = updates.script;
    if (updates.args !== undefined) live.args = updates.args;
    if (updates.cwd !== undefined) live.cwd = updates.cwd;
    if (updates.desc !== undefined) live.desc = updates.desc;
    if (updates.port !== undefined) live.port = updates.port;
    if (updates.envs !== undefined) live.envs = updates.envs;
    if (updates.group !== undefined) live.group = updates.group;
    await persist(live);
    dashboardEvents.emitProcessChange();
    return true;
  }
  const repo = await ensureRepository();
  const record = await repo.getById(id);
  if (!record) return false;
  await repo.upsert({ ...record, ...updates });
  dashboardEvents.emitProcessChange();
  return true;
}

export async function saveProcessRecord(input: {
  name?: string;
  script: string;
  args: string[];
  cwd: string;
  desc?: string;
  group?: string | null;
  favorite?: boolean;
  port?: number | null;
  envs?: Record<string, string> | null;
}): Promise<ProcessRecord> {
  const repo = await ensureRepository();
  // An import whose command (script + args + cwd) matches an existing favorite
  // record overwrites it instead of creating a duplicate — but only when the
  // import itself creates a favorite. Non-favorite creations (e.g. the
  // dashboard's clone: same command as its source) always insert a new record,
  // otherwise cloning a favorite would just overwrite the source.
  const existing =
    (input.favorite ?? true) === true
      ? (await repo.getAll()).find(
          (p) =>
            p.favorite &&
            p.script === input.script &&
            p.cwd === input.cwd &&
            p.args.length === input.args.length &&
            p.args.every((a, i) => a === input.args[i]),
        )
      : undefined;
  const record: ProcessRecord = {
    id: existing?.id ?? generateProcessId(),
    name: input.name || input.script,
    script: input.script,
    args: input.args,
    cwd: input.cwd,
    // Runtime fields are preserved when overwriting, so an import never
    // disturbs a running instance of the same command.
    status: existing?.status ?? "exited",
    pid: existing?.pid ?? null,
    exitCode: existing?.exitCode ?? null,
    error: existing?.error ?? null,
    desc: input.desc ?? null,
    group: input.group ?? null,
    favorite: input.favorite ?? true,
    port: input.port ?? null,
    startedAt: existing?.startedAt ?? Date.now(),
    lastStartedAt: existing?.lastStartedAt ?? null,
    stoppedAt: existing?.stoppedAt ?? null,
    stdoutLogPath: existing?.stdoutLogPath ?? null,
    stderrLogPath: existing?.stderrLogPath ?? null,
    roomId: existing?.roomId ?? null,
    // Explicitly provided envs win; otherwise an overwrite keeps the record's
    // stored envs (imports without envs must not wipe what a restart needs).
    envs: input.envs !== undefined ? input.envs : (existing?.envs ?? null),
  };
  await repo.upsert(record);
  dashboardEvents.emitProcessChange();
  return record;
}

// Fetch a persisted process record by id (used by the HTTP layer to serve
// logs/paths for stopped/expired processes whose in-memory metadata is gone).
export async function getProcessRecord(
  id: string,
): Promise<ProcessRecord | undefined> {
  const repo = await ensureRepository();
  return repo.getById(id);
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

// On Windows, bare commands such as `npm` are usually installed as `npm.cmd`
// batch shims. spawn() only resolves `.exe` through CreateProcess, so look the
// command up on PATH with the PATHEXT extensions and route .cmd/.bat files
// through the shell — spawning batch files directly throws EINVAL on modern
// Node (CVE-2024-27980). Non-Windows platforms keep the script untouched.
export function resolveSpawnTarget(
  script: string,
  cwd: string,
): { command: string; shell: boolean } {
  if (process.platform !== "win32") return { command: script, shell: false };

  const exts = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter(Boolean);
  const hasDir = /[\\/]/.test(script);
  const dirs = hasDir
    ? [path.dirname(path.resolve(cwd, script))]
    : (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const base = path.basename(script);

  for (const dir of dirs) {
    // With an explicit extension (e.g. `npm.cmd`) try the exact name first;
    // extension-less names are only completed with PATHEXT extensions.
    const names = /\.(cmd|bat|exe|com)$/i.test(base)
      ? [base, ...exts.map((ext) => base + ext)]
      : exts.map((ext) => base + ext);
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (!existsSync(candidate)) continue;
      if (/\.(cmd|bat)$/i.test(candidate)) {
        // shell mode joins command and args with plain spaces, so quote the
        // path ourselves to keep paths containing spaces intact.
        return { command: `"${candidate}"`, shell: true };
      }
      return { command: candidate, shell: false };
    }
  }
  // Nothing found via PATHEXT: keep the original script (CreateProcess still
  // resolves bare `.exe` names) and let spawn surface the real error.
  return { command: script, shell: false };
}

// Package-manager lifecycle commands are non-interactive from procm's point
// of view. On Windows, keeping a piped stdin handle through pnpm/npm -> cmd ->
// tsx watch can prevent tsx's worker from starting; terminal launches use a
// console handle instead. Leave stdin piped for all other commands so the
// process-input API remains available where it is useful.
export function shouldIgnoreStdin(script: string, args: string[] | undefined): boolean {
  if (process.platform !== "win32") return false;
  const base = path.basename(script).replace(/\.(cmd|bat|exe)$/i, "").toLowerCase();
  if (!new Set(["pnpm", "npm", "yarn", "bun"]).has(base)) return false;
  const firstArg = (args?.[0] || "").toLowerCase();
  return firstArg === "run" || firstArg === "exec" || firstArg === "dlx";
}

export async function startProcess(
  processId: string,
  script: string,
  name: string | undefined,
  args: string[] | undefined,
  cwd: string,
  envs: Record<string, string>,
  desc?: string | null,
  port?: number | null,
  roomId?: string | null,
  group?: string | null,
): Promise<ProcessMetadata> {
  serverLog(
    `Starting process: ${name || script} with args: ${
      args?.join(" ") || ""
    } in cwd: ${cwd}`,
  );

  try {
    const command = createCommand(script, args);

    const roomEnv: Record<string, string> = {
      ...getConnectionEnv(),
      PROCM_PROCESS_ID: processId,
    };
    if (roomId) roomEnv.PROCM_ROOM_ID = roomId;
    const spawnTarget = resolveSpawnTarget(script, cwd);
    const ignoreStdin = shouldIgnoreStdin(script, args);
    const childProcess = spawn(spawnTarget.command, args || [], {
      cwd,
      shell: spawnTarget.shell,
      windowsHide: true,
      stdio: [ignoreStdin ? "ignore" : "pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...envs,
        ...roomEnv,
      },
    });

    // Attach log consumers immediately. A command can fail between `spawn`
    // and the async spawn wait below (for example, a port-in-use startup
    // error); delaying these consumers loses the only useful stderr lines.
    const stdoutClientPromise = createProcessStdoutClient({
      id: processId,
      type: "stdout",
      readable: childProcess.stdout!,
      serverId: logServerId,
    });
    const stderrClientPromise = createProcessStdoutClient({
      id: processId,
      type: "stderr",
      readable: childProcess.stderr!,
      serverId: logServerId,
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
      applyProcessState();
    });

    // `close` runs after stdout/stderr have closed, so the captured tail
    // includes the process's final error instead of only its exit code.
    childProcess.on("close", (code, signal) => {
      if (code === 0) return;
      void (async () => {
        const label = name || script;
        const stderrClient =
          processMetadata?.stderrClient ?? (await stderrClientPromise.catch(() => null));
        const stderrTail = stderrClient ? await stderrClient.top(10) : [];
        const tailText = stderrTail.map((chunk) => chunk.message).join("\n").trim();
        const logPath = stderrClient?.textFilePath ?? "unavailable";
        const reason = code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
        const msg =
          `Process "${label}" (ID: ${processId}) exited with ${reason}. ` +
          `Command: ${script} ${(args ?? []).join(" ")}; cwd: ${cwd}; stderr log: ${logPath}` +
          (tailText ? `\nLast stderr (up to 10 lines):\n${tailText}` : "\nLast stderr: <empty>");
        serverLog(msg);
        console.error(`procm-mcp: ${msg}`);
      })().catch((error) => {
        const msg = `Failed to collect exit diagnostics for process "${name || script}" (ID: ${processId}): ${toErrorMessage(error)}`;
        serverLog(msg);
        console.error(`procm-mcp: ${msg}`);
      });
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

    // Do not register a process until spawn has actually succeeded. On a
    // launch error Node may still assign a PID before emitting `error`; that
    // stale PID later makes cleanup try to kill an already-dead process.
    const spawnOutcome = new Promise<void>((resolve, reject) => {
      childProcess.once("spawn", () => resolve());
      childProcess.once("error", (error) => reject(error));
    });
    await spawnOutcome;

    const [stdoutClient, stderrClient]: [ProcessStdoutClient, ProcessStdoutClient] =
      await Promise.all([stdoutClientPromise, stderrClientPromise]);

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
      group: group?.trim() || null,
      port: port ?? null,
      roomId: roomId?.trim() || null,
      favorite: false,
      process: childProcess,
      stdoutClient,
      stderrClient,
    };
    // The child can exit between the spawn event and metadata registration.
    // Apply the latest lifecycle state before returning it to the caller.
    applyProcessState();
    if (processMetadata.roomId) await ensureRoom(processMetadata.roomId, processId);
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
      let forceKillTimeoutId!: NodeJS.Timeout;
      let onExit!: () => void;
      const processExited = new Promise<void>((resolve) => {
        onExit = () => {
          clearTimeout(forceKillTimeoutId);
          serverLog(
            `Process exited: ${processMetadata.name} (ID: ${processMetadata.id})`,
          );
          resolve();
        };
        forceKillTimeoutId = setTimeout(() => {
          processMetadata.process.off("exit", onExit);

          serverLog(
            `Process did not exit in time, force killing: ${processMetadata.name} (ID: ${processMetadata.id})`,
          );
          void killProcessTree(pid, processMetadata, true);

          resolve();
        }, 10 * 1000);
        processMetadata.process.on("exit", onExit);
      });

      const killSucceeded = await killProcessTree(pid, processMetadata);
      if (killSucceeded) {
        await processExited;
      } else {
        clearTimeout(forceKillTimeoutId);
        processMetadata.process.off("exit", onExit);
      }

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
    await removeProcessFromRooms(id);
    dashboardEvents.emitProcessChange();
    return true;
  }
  return false;
}

// Bulk-delete many processes in one pass — the concurrency-safe alternative to
// fanning out `deleteProcess` per id. The per-id path races in the durable
// store (lowdb doesn't serialize its read-modify-write), and concurrent kills
// also interleave in the in-memory array. Here the kill phase runs first
// (independent — kills target PIDs, not indices), then the in-memory array and
// the JSON store are each mutated once, atomically, with a single change
// broadcast at the end. Returns the ids actually removed vs. not found.
export async function deleteProcesses(
  ids: string[],
): Promise<{ deleted: string[]; notFound: string[] }> {
  if (ids.length === 0) return { deleted: [], notFound: [] };

  // Phase 1 — stop every live process in the set. These are independent and
  // safe to run concurrently: each kill acts on its own ChildProcess, not on
  // the shared `processes` array.
  const liveMetas = ids
    .map((id) => processes.find((p) => p.id === id))
    .filter((m): m is ProcessMetadata => m != null);
  await Promise.allSettled(liveMetas.map((m) => killProcess(m)));

  // Phase 2 — drop every live entry from the in-memory list in a single
  // synchronous pass (no `await` between the index lookups, so nothing can
  // interleave and shift indices mid-loop).
  const liveIds = new Set(liveMetas.map((m) => m.id));
  if (liveIds.size > 0) {
    for (let i = processes.length - 1; i >= 0; i--) {
      if (liveIds.has(processes[i].id)) {
        startedAtByMeta.delete(processes[i].id);
        processes.splice(i, 1);
      }
    }
  }

  // Phase 3 — erase all of the records from the durable store in one
  // read-modify-write cycle so concurrent writes can't resurrect survivors.
  let removedStoredIds: string[] = [];
  try {
    const repo = await ensureRepository();
    const removedCount = await repo.removeMany(ids);
    // removeMany returns a count, not the ids, so re-derive which stored ids
    // were actually erased by diffing — only when something was removed.
    if (removedCount > 0) {
      const remaining = new Set((await repo.getAll()).map((r) => r.id));
      removedStoredIds = ids.filter((id) => !remaining.has(id));
    }
  } catch (err) {
    serverLog(`Error bulk-deleting process records: ${toErrorMessage(err)}`);
  }

  // An id is "deleted" if it left either the live list or the store.
  const deletedSet = new Set<string>([...liveIds, ...removedStoredIds]);
  const deleted = ids.filter((id) => deletedSet.has(id));
  const notFound = ids.filter((id) => !deletedSet.has(id));

  await Promise.all(deleted.map((id) => removeProcessFromRooms(id)));

  if (deleted.length > 0) dashboardEvents.emitProcessChange();
  return { deleted, notFound };
}

// Whitelisted POSIX/Windows signals we allow sending to a managed child. These
// cover the common operator intents (Ctrl+C = SIGINT, suspend/resume, custom
// hooks, hard kill). Names are platform-portable constants on Node; on Windows
// tree-kill semantics differ but process.kill with these names still resolves.
export const ALLOWED_INPUT_SIGNALS = [
  "SIGINT", // Ctrl+C
  "SIGTERM", // default "terminate" (graceful shutdown)
  "SIGKILL", // force kill (cannot be caught)
  "SIGHUP", // hangup (often reload)
  "SIGUSR1",
  "SIGUSR2",
  "SIGTSTP", // Ctrl+Z (terminal stop)
  "SIGCONT", // resume after SIGTSTP
  "SIGQUIT", // quit with core dump (Ctrl+\)
] as const;
export type InputSignal = (typeof ALLOWED_INPUT_SIGNALS)[number];

export function isInputSignal(v: unknown): v is InputSignal {
  return typeof v === "string" && (ALLOWED_INPUT_SIGNALS as readonly string[]).includes(v);
}

// Result of writing to a process's stdin or sending it a signal. `ok:false`
// carries a discriminated `reason` so callers (MCP tool / HTTP route) can map
// to the right response without parsing strings.
export type SendInputResult =
  | { ok: true; kind: "text"; bytes: number }
  | { ok: true; kind: "signal"; signal: InputSignal }
  | { ok: false; reason: "not_found"; error?: string }
  | { ok: false; reason: "no_stdin"; error?: string }
  | { ok: false; reason: "bad_request"; error?: string }
  | { ok: false; reason: "write_error"; error?: string };

// Write to a running process's stdin (text mode) or deliver an OS signal to it
// (signal mode). One of `text` or `signal` must be provided; both is rejected.
// The child is spawned with the default piped stdio, so `stdin` is a writable
// stream we can write to directly. Signals go through `process.kill(pid, sig)`,
// which is cross-platform (Windows maps these to TerminateProcess-style calls).
//
// This does NOT persist state or broadcast a process-list change: sending input
// doesn't alter the process record. The exit/error handlers on the child still
// fire normally if the input (e.g. SIGINT) causes it to terminate.
export function sendProcessInput(
  id: string,
  opts: { text?: string; newline?: boolean; signal?: string },
): SendInputResult {
  const meta = getProcess(id);
  if (!meta) {
    return { ok: false, reason: "not_found" };
  }

  const { text, newline = true, signal } = opts;

  // Exactly one of text / signal must be set.
  const hasText = text !== undefined && text !== null;
  const hasSignal = signal !== undefined && signal !== null;
  if (!hasText && !hasSignal) {
    return {
      ok: false,
      reason: "bad_request",
      error: `Provide either "text" (to write to the process's stdin) or "signal" (to send an OS signal like SIGINT).`,
    };
  }
  if (hasText && hasSignal) {
    return {
      ok: false,
      reason: "bad_request",
      error: `Provide only one of "text" or "signal", not both.`,
    };
  }

  // --- signal mode --------------------------------------------------------
  if (hasSignal) {
    if (!isInputSignal(signal)) {
      return {
        ok: false,
        reason: "bad_request",
        error: `Unsupported signal "${signal}". Allowed: ${ALLOWED_INPUT_SIGNALS.join(", ")}.`,
      };
    }
    const pid = meta.pid;
    if (!pid) {
      return {
        ok: false,
        reason: "write_error",
        error: `Process ${meta.name} (ID: ${id}) has no PID yet; cannot signal.`,
      };
    }
    try {
      process.kill(pid, signal);
      serverLog(`Sent signal ${signal} to process ${meta.name} (ID: ${id}, PID: ${pid}).`);
      return { ok: true, kind: "signal", signal };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      const msg = e.code === "ESRCH"
        ? `Process ${meta.name} (ID: ${id}) is no longer running.`
        : toErrorMessage(err);
      serverLog(`Failed to send signal ${signal} to process ${meta.name} (ID: ${id}): ${msg}`);
      return { ok: false, reason: "write_error", error: msg };
    }
  }

  // --- text mode ----------------------------------------------------------
  // Reaching here means hasText is true (the exclusivity checks above reject
  // the neither/both cases); narrow explicitly so TS sees `text` as a string.
  if (text === undefined || text === null) {
    return { ok: false, reason: "bad_request", error: `Missing "text".` };
  }
  const stdin = meta.process.stdin;
  if (!stdin || stdin.destroyed || !stdin.writable) {
    return {
      ok: false,
      reason: "no_stdin",
      error: `Process ${meta.name} (ID: ${id}) has no writable stdin. The child may have closed it or was spawned with stdio disabled.`,
    };
  }

  const payload = newline ? text + "\n" : text;
  try {
    // write() without a callback is safe; it returns a backpressure boolean,
    // not an error. Errors surface via the stream's 'error' event, which the
    // child's stdout/stderr plumbing already routes to the exit/error path.
    stdin.write(payload);
    const bytes = Buffer.byteLength(payload, "utf8");
    serverLog(`Wrote ${bytes} byte(s) to stdin of process ${meta.name} (ID: ${id}).`);
    return { ok: true, kind: "text", bytes };
  } catch (err) {
    const msg = toErrorMessage(err);
    serverLog(`Error writing to stdin of process ${meta.name} (ID: ${id}): ${msg}`);
    return { ok: false, reason: "write_error", error: msg };
  }
}

// Restart an existing process, preserving its id. A live in-memory process is
// killed then re-spawned in place; a stopped/expired process (no longer in
// memory) is rebuilt from its persisted record — including the originally
// supplied envs, so the launch environment is fully reproduced. Returns null
// only when no live process AND no stored record exists for the id.
export async function restartProcess(id: string): Promise<ProcessMetadata | null> {
  const processIndex = findProcessIndex(id);
  if (processIndex !== -1) {
    // Live process: kill then re-spawn in place, keeping list position.
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
      processMetadata.port,
      processMetadata.roomId,
      processMetadata.group,
    );
    newProcess.favorite = processMetadata.favorite;
    processes[processIndex] = newProcess;
    // This branch reassigns in place and bypasses pushProcess, so reset the
    // most-recent-start time explicitly — this is the restart that "time since
    // last restart" must reflect. (Persist happens later via the spawn handlers
    // in startProcess, same as the rest of the record.)
    lastStartedAtByMeta.set(id, Date.now());
    void persist(newProcess);
    dashboardEvents.emitProcessChange();
    return newProcess;
  }

  // Not in memory: fall back to the persisted record so a stopped process can
  // be revived. Restores script/args/cwd/envs/desc from history; envs default
  // to {} for records written before envs were persisted.
  const record = await getProcessRecord(id);
  if (!record) {
    return null;
  }
  const restored = await startProcess(
    id,
    record.script,
    record.name,
    record.args,
    record.cwd,
    record.envs ?? {},
    record.desc,
    record.port ?? null,
    record.roomId ?? null,
    record.group ?? null,
  );
  restored.favorite = record.favorite ?? false;
  // Preserve the original start time so the revived process keeps its place
  // in the history-sorted list instead of jumping to the top.
  if (record.startedAt) startedAtByMeta.set(id, record.startedAt);
  pushProcess(restored);
  return restored;
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
): Promise<boolean> {
  // On Windows, SIGTERM is not supported — always use SIGKILL which maps to
  // `taskkill /T /F` in tree-kill, ensuring cmd /c child processes are also terminated.
  const signal =
    process.platform === "win32" ? "SIGKILL" : force ? "SIGKILL" : "SIGTERM";

  return new Promise<boolean>((resolve) => {
    kill(pid, signal, async (err) => {
      if (err) {
        serverLog(
          `Error killing process: ${processMetadata.name} (ID: ${processMetadata.id}) - ${err}`,
        );
        // A stale/already-exited PID must not block restart or shutdown.
        // Treat the kill as best-effort; the next lifecycle step owns recovery.
        resolve(false);
      } else {
        serverLog(
          `Process killed successfully: ${processMetadata.name} (ID: ${processMetadata.id})`,
        );
        resolve(true);
      }
    });
  });
}

// Internal helper for pushing a freshly started process onto the list.
export function pushProcess(metadata: ProcessMetadata) {
  processes.push(metadata);
  startedAtByMeta.set(metadata.id, Date.now());
  // A fresh registration is also a (re)start, so reset the most-recent-start
  // time here. Every entry path that registers a process goes through this,
  // except the live-restart branch in restartProcess (which reassigns in place).
  lastStartedAtByMeta.set(metadata.id, Date.now());
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
