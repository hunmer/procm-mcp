import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

export type LogRecord = {
  timestamp: number;
  message: string;
};

type LogsDb = {
  logs: LogRecord[];
};

export type LogsRepository = {
  initialize: () => Promise<void>;
  insert: (record: LogRecord) => Promise<void>;
  top: (count: number) => Promise<LogRecord[]>;
  search: (pattern: RegExp, count?: number) => Promise<LogRecord[]>;
  close: () => Promise<void>;
};

export async function createLogsRepository(
  filePath: string
): Promise<LogsRepository> {
  const db = new Low<LogsDb>(new JSONFile<LogsDb>(filePath), { logs: [] });

  return {
    initialize: () => initialize(db),
    insert: (record: LogRecord) => insert(db, record),
    top: (count: number) => top(db, count),
    search: (pattern: RegExp, count?: number) => search(db, pattern, count),
    close: () => close(db),
  };
}

async function initialize(db: Low<LogsDb>): Promise<void> {
  await db.read();
  await db.write();
}

async function insert(db: Low<LogsDb>, record: LogRecord): Promise<void> {
  await db.read();
  db.data.logs.push(record);
  await db.write();
}

async function top(db: Low<LogsDb>, count: number): Promise<LogRecord[]> {
  await db.read();
  return [...db.data.logs]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, count);
}

// Search logs by a regex over the message text. Returns matches newest-first,
// limited to `count` (default 50). The repository is already read fully into
// memory by lowdb, so this just filters the in-memory array.
async function search(
  db: Low<LogsDb>,
  pattern: RegExp,
  count = 50,
): Promise<LogRecord[]> {
  await db.read();
  return [...db.data.logs]
    .filter((record) => pattern.test(record.message))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, count);
}

async function close(db: Low<LogsDb>): Promise<void> {
  await db.write();
}
