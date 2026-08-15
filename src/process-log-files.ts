import path from "path";
import { readdir, stat, unlink } from "fs/promises";
import { getProcess, getProcessRecord, listProcessRecords } from "./process-manager.js";
import { logServerId } from "./server-log.js";
import { ServerDir } from "./server-dir.js";

export type ProcessLogPaths = {
  stdoutPath: string | null;
  stderrPath: string | null;
};

export type ProcessLogFile = {
  name: string;
  path: string;
  processId: string;
  stream: "stdout" | "stderr";
  size: number;
  modifiedAt: number;
  processName: string | null;
  status: string | null;
};

const LOG_FILE_NAME_RE = /^(.+)-(stdout|stderr)\.log$/;

export async function getProcessLogPaths(id: string): Promise<ProcessLogPaths | null> {
  const live = getProcess(id);
  if (live) {
    return {
      stdoutPath: path.resolve(live.stdoutClient.textFilePath),
      stderrPath: path.resolve(live.stderrClient.textFilePath),
    };
  }
  const record = await getProcessRecord(id);
  if (!record) return null;
  return {
    stdoutPath: record.stdoutLogPath ? path.resolve(record.stdoutLogPath) : null,
    stderrPath: record.stderrLogPath ? path.resolve(record.stderrLogPath) : null,
  };
}

function processLogDir(): string {
  return path.join(ServerDir({ serverId: logServerId }), "processes");
}

export async function listProcessLogFiles(): Promise<ProcessLogFile[]> {
  const records = await listProcessRecords();
  const byId = new Map(records.map((record) => [record.id, record] as const));
  const candidates = new Set<string>();

  try {
    for (const name of await readdir(processLogDir())) {
      if (LOG_FILE_NAME_RE.test(name)) candidates.add(path.join(processLogDir(), name));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const record of records) {
    for (const filePath of [record.stdoutLogPath, record.stderrLogPath]) {
      if (filePath && LOG_FILE_NAME_RE.test(path.basename(filePath))) candidates.add(filePath);
    }
  }

  const files = await Promise.all(Array.from(candidates).map(async (candidate): Promise<ProcessLogFile | null> => {
    const filePath = path.resolve(candidate);
    const match = path.basename(filePath).match(LOG_FILE_NAME_RE);
    if (!match) return null;
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) return null;
    const record = byId.get(match[1]);
    return {
      name: match[0],
      path: filePath,
      processId: match[1],
      stream: match[2] as "stdout" | "stderr",
      size: info.size,
      modifiedAt: info.mtimeMs,
      processName: record?.name ?? null,
      status: record?.status ?? null,
    };
  }));

  return files.filter((file): file is ProcessLogFile => file !== null)
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

// Bulk-delete the on-disk log files listed by listProcessLogFiles, skipping
// files still owned by a live running/spawning process (their writers stay
// open, so the files must not be removed mid-write). A file that can't be
// unlinked (locked, already gone) is reported as skipped instead of failing
// the whole batch.
export async function deleteProcessLogFiles(): Promise<{
  deleted: string[];
  skipped: string[];
}> {
  const deleted: string[] = [];
  const skipped: string[] = [];
  for (const file of await listProcessLogFiles()) {
    const live = getProcess(file.processId);
    if (live && (live.status === "running" || live.status === "spawning")) {
      skipped.push(file.name);
      continue;
    }
    await unlink(file.path).then(
      () => deleted.push(file.name),
      () => skipped.push(file.name),
    );
  }
  return { deleted, skipped };
}
