import { exec } from "node:child_process";
import { promisify } from "node:util";
import kill from "tree-kill";
import findProcess from "find-process";

const pexec = promisify(exec);

// A single OS-level process row, surfaced to the dashboard's System tab.
// `cmd` is the full command line (exe path + args) when available; `exe` is the
// executable path. Both may be null on platforms/scopes that don't expose them
// (e.g. kernel processes, or non-Windows where only `cmd` is known).
// `ports` lists TCP ports the process is listening on (undefined when none or
// when the listening-port scan isn't available on this platform).
export interface SystemProcess {
  pid: number;
  ppid: number;
  name: string;
  cmd: string | null;
  exe: string | null;
  ports?: number[];
}

// Map of pid -> deduped listening TCP ports. Shared shape built by the
// per-platform port scanners and merged into each process row.
type PortMap = Map<number, number[]>;

function addPort(map: PortMap, pid: number, port: number): void {
  const arr = map.get(pid);
  if (arr) {
    if (!arr.includes(port)) arr.push(port);
  } else {
    map.set(pid, [port]);
  }
}

// Windows: PowerShell's Win32_Process CIM class exposes ProcessId,
// ParentProcessId, Name, ExecutablePath and CommandLine. ConvertTo-Json escapes
// command lines (which routinely contain spaces, quotes and commas) safely —
// unlike wmic's CSV. The same invocation also runs Get-NetTCPConnection to map
// each listening TCP port to its owning pid, so a single shell-out yields both
// the process list and the port→pid map. ~1.3s for ~420 processes + ~60 ports,
// cheap enough to poll at a multi-second cadence.
async function listWindows(): Promise<SystemProcess[]> {
  const ps =
    "$procs = Get-CimInstance Win32_Process | " +
    "Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine; " +
    "$ports = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | " +
    "Select-Object LocalPort,OwningProcess); " +
    "[pscustomobject]@{ processes = $procs; ports = $ports } | " +
    "ConvertTo-Json -Depth 3 -Compress";
  const { stdout } = await pexec(ps, {
    maxBuffer: 64 * 1024 * 1024,
    shell: "powershell",
    windowsHide: true,
  });
  const data = JSON.parse(stdout || "{}") as {
    processes?: unknown;
    ports?: unknown;
  };
  const procs = Array.isArray(data.processes)
    ? data.processes
    : data.processes
      ? [data.processes]
      : [];
  const portRows = Array.isArray(data.ports)
    ? data.ports
    : data.ports
      ? [data.ports]
      : [];

  // Build pid -> listening ports (a port may appear twice via IPv4 + IPv6).
  const pidPorts: PortMap = new Map();
  for (const pr of portRows as { LocalPort: unknown; OwningProcess: unknown }[]) {
    const pid = Number(pr.OwningProcess);
    const port = Number(pr.LocalPort);
    if (Number.isFinite(pid) && Number.isFinite(port)) {
      addPort(pidPorts, pid, port);
    }
  }

  const out: SystemProcess[] = [];
  for (const p of procs as Record<string, unknown>[]) {
    const pid = Number(p.ProcessId);
    if (!Number.isFinite(pid)) continue;
    out.push({
      pid,
      ppid: Number(p.ParentProcessId) || 0,
      name: String(p.Name ?? ""),
      cmd: p.CommandLine ? String(p.CommandLine) : null,
      exe: p.ExecutablePath ? String(p.ExecutablePath) : null,
      ports: pidPorts.get(pid),
    });
  }
  return out;
}

// Unix/macOS: ps-list returns pid/ppid/name and, on most platforms, the full
// command line in `cmd`. It has no separate executable-path field, so `exe`
// stays null (the path is embedded in `cmd`). Listening ports come from lsof
// (pid + port per line); if lsof is unavailable the map is empty — ports just
// won't be annotated, the list still works.
async function listUnixPorts(): Promise<PortMap> {
  const map: PortMap = new Map();
  try {
    const { stdout } = await pexec("lsof -nP -iTCP -sTCP:LISTEN", {
      maxBuffer: 64 * 1024 * 1024,
    });
    for (const line of stdout.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      const pid = Number(cols[1]);
      const name = cols[cols.length - 1]; // e.g. *:3000, 127.0.0.1:5432
      const m = /[:.](\d+)$/.exec(name ?? "");
      const port = m ? Number(m[1]) : NaN;
      if (Number.isFinite(pid) && Number.isFinite(port)) {
        addPort(map, pid, port);
      }
    }
  } catch {
    // lsof missing or failed — return an empty map (no port annotation).
  }
  return map;
}

// Unix/macOS: ps-list returns pid/ppid/name and, on most platforms, the full
// command line in `cmd`. It has no separate executable-path field, so `exe`
// stays null (the path is embedded in `cmd`).
async function listUnix(): Promise<SystemProcess[]> {
  const [psListMod, pidPorts] = await Promise.all([
    import("ps-list"),
    listUnixPorts(),
  ]);
  const psList = psListMod.default;
  const list = await psList();
  return list.map((p) => ({
    pid: p.pid,
    ppid: p.ppid,
    name: p.name,
    cmd: p.cmd ?? null,
    exe: null,
    ports: pidPorts.get(p.pid),
  }));
}

// Find the process(es) listening on a given TCP port (the toolbar "view port"
// lookup). Uses find-process, which maps port → pid across platforms. Returns
// SystemProcess-shaped rows so the caller can reuse the same info dialog.
export async function findProcessByPort(
  port: number,
): Promise<SystemProcess[]> {
  const list = await findProcess("port", port);
  if (!Array.isArray(list)) return [];
  return list.map((p) => ({
    pid: p.pid,
    ppid: p.ppid ?? 0,
    name: p.name ?? "",
    cmd: p.cmd ?? null,
    exe: p.bin ?? null,
    ports: [port],
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
  // Windows' taskkill supports recursive termination natively. On Unix,
  // build a process snapshot first and terminate descendants explicitly;
  // this keeps children alive even when they re-parent during tree-kill's
  // asynchronous discovery.
  if (process.platform === "win32") {
    return new Promise((resolve, reject) => {
      kill(pid, (err) => (err ? reject(err) : resolve()));
    });
  }

  return listSystemProcesses().then((processes) => {
    const children = new Map<number, number[]>();
    for (const process of processes) {
      const list = children.get(process.ppid);
      if (list) list.push(process.pid);
      else children.set(process.ppid, [process.pid]);
    }

    const descendants: number[] = [];
    const visit = (parentPid: number) => {
      for (const childPid of children.get(parentPid) ?? []) {
        visit(childPid);
        descendants.push(childPid);
      }
    };
    visit(pid);

    for (const childPid of descendants) {
      try {
        process.kill(childPid, "SIGTERM");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  });
}
