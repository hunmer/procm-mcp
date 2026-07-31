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
  // Epoch ms when the process was first started.
  startedAt: number;
  // Epoch ms when the process was removed from the live list (stopped by the
  // user or cleaned up). null while it is still tracked in memory.
  stoppedAt: number | null;
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
    close: () => close(db),
  };
}

async function initialize(db: Low<ProcessesDb>): Promise<void> {
  await db.read();
  await db.write();
}

// Insert or replace a record by id. We always overwrite the whole record so
// the persisted state matches the latest in-memory metadata (status, pid,
// exitCode, error, stoppedAt). startedAt is preserved when updating so the
// original launch time isn't lost across state changes.
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

async function close(db: Low<ProcessesDb>): Promise<void> {
  await db.write();
}
