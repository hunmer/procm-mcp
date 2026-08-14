import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { ProcessStatus } from "./types.js";

// A durable snapshot of a process record. Unlike the in-memory ProcessMetadata,
// this shape strips the live ChildProcess/clients and adds lifecycle timestamps
// so stopped/exited processes survive backend restarts.
export type ProcessRecord = {
  id: string;
  name: string;
  script: string;
  args: string[];
  cwd: string;
  status: ProcessStatus;
  pid: number | null;
  exitCode: number | null;
  error: string | null;
  // Optional human-readable description (persisted so it survives restarts).
  desc: string | null;
  // Optional port the process serves on. Persisted so the dashboard's one-click
  // open link survives restarts. Undefined on records written before this field
  // existed; null when explicitly absent.
  port?: number | null;
  // Epoch ms when the process was first started.
  startedAt: number;
  // Epoch ms of the most recent start; reset on every restart (distinct from
  // startedAt, which is the original launch time and is preserved). The
  // dashboard shows "time since last restart" from this. Undefined on records
  // written before this field existed; null when explicitly absent.
  lastStartedAt?: number | null;
  // Epoch ms when the process was removed from the live list (stopped by the
  // user or cleaned up). null while it is still tracked in memory.
  stoppedAt: number | null;
  // Absolute paths to the on-disk plain-text log files, captured at start time
  // so logs stay viewable/downloadable after the process is stopped/expired
  // (its in-memory clients are gone). Undefined on records written before this
  // field existed; null when explicitly absent.
  stdoutLogPath?: string | null;
  stderrLogPath?: string | null;
  // Operator-supplied environment variables, persisted so a stopped process can
  // be fully restored on restart. NEVER sent to clients — toPublicView /
  // toPublicRecord deliberately omit it; it lives only on disk for recovery.
  envs?: Record<string, string> | null;
};

type ProcessesDb = {
  processes: ProcessRecord[];
};

export type ProcessesRepository = {
  initialize: () => Promise<void>;
  upsert: (record: ProcessRecord) => Promise<void>;
  getAll: () => Promise<ProcessRecord[]>;
  getById: (id: string) => Promise<ProcessRecord | undefined>;
  remove: (id: string) => Promise<boolean>;
  removeMany: (ids: string[]) => Promise<number>;
  close: () => Promise<void>;
};

export async function createProcessesRepository(
  filePath: string,
): Promise<ProcessesRepository> {
  const db = new Low<ProcessesDb>(new JSONFile<ProcessesDb>(filePath), {
    processes: [],
  });

  return {
    initialize: () => initialize(db),
    upsert: (record) => upsert(db, record),
    getAll: () => getAll(db),
    getById: (id) => getById(db, id),
    remove: (id) => remove(db, id),
    removeMany: (ids) => removeMany(db, ids),
    close: () => close(db),
  };
}

async function initialize(db: Low<ProcessesDb>): Promise<void> {
  await db.read();
  await db.write();
}

// Insert or replace a record by id. We always overwrite the whole record so
// the persisted state matches the latest in-memory metadata (status, pid,
// exitCode, error, stoppedAt, lastStartedAt). startedAt is preserved when
// updating so the original launch time isn't lost across state changes;
// lastStartedAt is NOT preserved so every restart resets it.
async function upsert(db: Low<ProcessesDb>, record: ProcessRecord): Promise<void> {
  await db.read();
  const idx = db.data.processes.findIndex((p) => p.id === record.id);
  if (idx === -1) {
    db.data.processes.push(record);
  } else {
    const existing = db.data.processes[idx];
    db.data.processes[idx] = {
      ...record,
      // Preserve the original start time on updates; a restart reuses the id
      // and should not reset startedAt.
      startedAt: existing.startedAt || record.startedAt,
    };
  }
  await db.write();
}

async function getAll(db: Low<ProcessesDb>): Promise<ProcessRecord[]> {
  await db.read();
  return db.data.processes;
}

async function getById(
  db: Low<ProcessesDb>,
  id: string,
): Promise<ProcessRecord | undefined> {
  await db.read();
  return db.data.processes.find((p) => p.id === id);
}

// Physically remove a record from the store. Returns true if a record was
// deleted, false if no record with that id existed. Unlike markStopped, this
// erases the history entry entirely (used by the dashboard "delete" action).
async function remove(db: Low<ProcessesDb>, id: string): Promise<boolean> {
  await db.read();
  const idx = db.data.processes.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  db.data.processes.splice(idx, 1);
  await db.write();
  return true;
}

// Remove many records in a single read-modify-write cycle. This is the
// concurrency-safe way to delete more than one record at once: lowdb does
// not serialize the per-id `remove()` cycle, so fanning out N concurrent
// deletes lets each one read the same snapshot, drop only its own row, and
// have the last `write()` win — resurrecting the others. Returns the count
// of records actually removed.
async function removeMany(
  db: Low<ProcessesDb>,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  await db.read();
  const doomed = new Set(ids);
  const before = db.data.processes.length;
  db.data.processes = db.data.processes.filter((p) => !doomed.has(p.id));
  const removed = before - db.data.processes.length;
  if (removed > 0) await db.write();
  return removed;
}

async function close(db: Low<ProcessesDb>): Promise<void> {
  await db.write();
}
