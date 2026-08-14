import { exec } from "node:child_process";
import { promisify } from "node:util";
import kill from "tree-kill";

const pexec = promisify(exec);

// A single OS-level process row, surfaced to the dashboard's System tab.
// `cmd` is the full command line (exe path + args) when available; `exe` is the
// executable path. Both may be null on platforms/scopes that don't expose them
// (e.g. kernel processes, or non-Windows where only `cmd` is known).
export interface SystemProcess {
  pid: number;
  ppid: number;
  name: string;
  cmd: string | null;
  exe: string | null;
}

// Windows: PowerShell's Win32_Process CIM class exposes ProcessId,
// ParentProcessId, Name, ExecutablePath and CommandLine. ConvertTo-Json escapes
// command lines (which routinely contain spaces, quotes and commas) safely —
// unlike wmic's CSV. ~300ms for ~420 processes, so it's cheap enough to poll at
// a multi-second cadence.
async function listWindows(): Promise<SystemProcess[]> {
  const ps =
    "Get-CimInstance Win32_Process | " +
    "Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | " +
    "ConvertTo-Json -Compress -Depth 2";
  const { stdout } = await pexec(ps, {
    maxBuffer: 64 * 1024 * 1024,
    shell: "powershell",
    windowsHide: true,
  });
  const data: unknown = JSON.parse(stdout || "[]");
  const arr = Array.isArray(data) ? data : [data];
  const out: SystemProcess[] = [];
  for (const p of arr as Record<string, unknown>[]) {
    const pid = Number(p.ProcessId);
    if (!Number.isFinite(pid)) continue;
    out.push({
      pid,
      ppid: Number(p.ParentProcessId) || 0,
      name: String(p.Name ?? ""),
      cmd: p.CommandLine ? String(p.CommandLine) : null,
      exe: p.ExecutablePath ? String(p.ExecutablePath) : null,
    });
  }
  return out;
}

// Unix/macOS: ps-list returns pid/ppid/name and, on most platforms, the full
// command line in `cmd`. It has no separate executable-path field, so `exe`
// stays null (the path is embedded in `cmd`).
async function listUnix(): Promise<SystemProcess[]> {
  const psList = (await import("ps-list")).default;
  const list = await psList();
  return list.map((p) => ({
    pid: p.pid,
    ppid: p.ppid,
    name: p.name,
    cmd: p.cmd ?? null,
    exe: null,
  }));
}

// Enumerate all running OS processes, cross-platform.
export function listSystemProcesses(): Promise<SystemProcess[]> {
  return process.platform === "win32" ? listWindows() : listUnix();
}

// PIDs that must never be killed from the dashboard: the idle/system pids and
// this server's own pid. Killing the host process would take the dashboard
// itself down; pid 0/4 are kernel slots Windows refuses to terminate anyway.
function isProtectedPid(pid: number): boolean {
  return pid <= 4 || pid === process.pid;
}

// Kill a process and its entire descendant tree. tree-kill maps to
// `taskkill /T /F` on Windows (so cmd /c grandchildren die too) and to a
// SIGTERM/SIGKILL sweep on Unix. Resolves once the tree is gone; rejects with
// the underlying error otherwise. Protected pids are refused upfront.
export function killProcessTree(pid: number): Promise<void> {
  if (!Number.isFinite(pid)) {
    return Promise.reject(new Error("Invalid pid"));
  }
  if (isProtectedPid(pid)) {
    return Promise.reject(new Error("Refusing to kill a protected system pid"));
  }
  return new Promise((resolve, reject) => {
    kill(pid, (err) => (err ? reject(err) : resolve()));
  });
}
