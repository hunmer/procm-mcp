import path from "path";
import fs from "fs";
import { mkdirp } from "mkdirp";
import { ServerDir } from "./server-dir.js";
import { ProcmMcpDir } from "./procm-mcp-dir.js";

// Cap per debug.log file. Precedence: value persisted in settings.json (set
// via the dashboard's /api/server-log/settings) > PROCM_DEBUG_LOG_MAX_BYTES
// > 20MB default. Read once per process and on every explicit update; log()
// is hot enough that it must not touch the settings file per write.
const DEFAULT_DEBUG_LOG_MAX_BYTES = 20 * 1024 * 1024;
const SETTINGS_FILE = "settings.json";

type LogSettings = { debugLogMaxBytes?: number };

function settingsPath(): string {
  return path.join(ProcmMcpDir(), SETTINGS_FILE);
}

function readSettings(): LogSettings {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettings(settings: LogSettings): void {
  fs.mkdirSync(ProcmMcpDir(), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

function envMaxBytes(): number | null {
  const value = Number(process.env.PROCM_DEBUG_LOG_MAX_BYTES);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export type DebugLogSettings = {
  maxBytes: number;
  defaultMaxBytes: number;
  envMaxBytes: number | null;
};

let cachedSettings: LogSettings | null = null;

function debugLogSettings(): DebugLogSettings {
  if (!cachedSettings) cachedSettings = readSettings();
  const stored = cachedSettings.debugLogMaxBytes;
  const env = envMaxBytes();
  const maxBytes =
    typeof stored === "number" && Number.isFinite(stored) && stored > 0
      ? stored
      : env ?? DEFAULT_DEBUG_LOG_MAX_BYTES;
  return { maxBytes, defaultMaxBytes: DEFAULT_DEBUG_LOG_MAX_BYTES, envMaxBytes: env };
}

export function getDebugLogSettings(): DebugLogSettings {
  return debugLogSettings();
}

// Set the persisted cap (bytes); null clears the override so the env/default
// applies again. Takes effect immediately for subsequent log() writes.
export function setDebugLogMaxBytes(bytes: number | null): DebugLogSettings {
  if (cachedSettings === null) cachedSettings = readSettings();
  if (bytes === null) delete cachedSettings.debugLogMaxBytes;
  else cachedSettings.debugLogMaxBytes = bytes;
  writeSettings(cachedSettings);
  return debugLogSettings();
}

export type DebugLogFile = {
  name: string;
  path: string;
  size: number;
  modifiedAt: number;
};

// Every debug.log under any server-generation dir in the data root,
// newest-modified first.
export function listDebugLogFiles(): DebugLogFile[] {
  const root = ProcmMcpDir();
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return [];
  }
  const files: DebugLogFile[] = [];
  for (const name of entries) {
    const filePath = path.join(root, name, "debug.log");
    let info: fs.Stats;
    try {
      info = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!info.isFile()) continue;
    files.push({ name, path: filePath, size: info.size, modifiedAt: info.mtimeMs });
  }
  return files.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

// Remove every server-log directory in the data root (each holds debug.log
// plus the processes/ stdout/stderr logs — nothing else lives there). The
// current generation's dir is emptied instead of removed: its running
// processes hold open handles into processes/, and Windows refuses to delete
// open files. Returns every handled directory name under `cleared`.
export function clearDebugLogDirs({ currentServerId }: { currentServerId: string }): {
  cleared: string[];
} {
  const root = ProcmMcpDir();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return { cleared: [] };
  }
  const cleared: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    if (!fs.existsSync(path.join(dir, "debug.log"))) continue;
    if (entry.name === currentServerId) {
      fs.writeFileSync(path.join(dir, "debug.log"), "", "utf8");
      // Best effort: drop finished processes' logs; live writers keep theirs.
      try {
        fs.rmSync(path.join(dir, "processes"), { recursive: true, force: true });
      } catch {
        // Partially locked (running process) — keep what couldn't be removed.
      }
    } else {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    cleared.push(entry.name);
  }
  return { cleared };
}

export function log(message: string, { id }: { id: string }): void {
  const logFilePath = path.join(ServerDir({ serverId: id }), "debug.log");
  mkdirp.sync(path.dirname(logFilePath));
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  try {
    const { size } = fs.statSync(logFilePath);
    if (size + Buffer.byteLength(logMessage) > debugLogSettings().maxBytes) fs.truncateSync(logFilePath, 0);
  } catch {
    // File does not exist yet; appendFileSync below creates it.
  }

  fs.appendFileSync(logFilePath, logMessage, { encoding: "utf8" });
}
