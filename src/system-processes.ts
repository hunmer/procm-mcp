import { exec } from "node:child_process";
import { promisify } from "node:util";
import kill from "tree-kill";
import findProcess from "find-process";

const pexec = promisify(exec);

// A single OS-level process row, surfaced to the dashboard's System tab.
// `cmd` is the full command line (exe path + args) when available; `exe` is
// the executable path (Windows' ExecutablePath, ps-list's best-effort `path`
// on Unix — null when the platform/scope doesn't expose one). `name` is the
// executable's short name (final path segment — see cleanName).
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

// Process names may arrive as full executable paths — macOS reports `comm` as
// e.g. /Applications/Safari.app/Contents/MacOS/Safari — so reduce to the final
// path segment. Bare names (Windows exe names, Unix daemon names) contain no
// separators and pass through unchanged.
function cleanName(name: string): string {
  const segments = name.split(/[\\/]+/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : name;
}

// The executable path leading a command line (quoted when it contains spaces).
// Empty when there's no command line. Used by the system-process check below,
// which needs a path even on platforms that don't expose `exe` separately.
function cmdExeToken(cmd: string | null): string {
  if (!cmd) return "";
  const m = cmd.match(/^"([^"]+)"|^(\S+)/);
  return m ? (m[1] ?? m[2] ?? "") : "";
}

// Well-known OS housekeeping processes hidden from the System tab: they're
// noise for a dev-process dashboard and never meaningful kill targets. Stored
// lowercased; matched case-insensitively against the cleaned name. Covers the
// core Windows binaries (whose names arrive as *.exe) and the macOS
// kernel/user-session processes whose executable doesn't live under a system
// directory — the rest are caught by the path rules below.
const COMMON_SYSTEM_NAMES = new Set([
  // macOS
  "kernel_task",
  "launchd",
  "launchd_sim",
  "loginwindow",
  "usereventagent",
  "windowserver",
  "dock",
  "finder",
  "systemuiserver",
  "spotlight",
  "mds",
  "mds_stores",
  "mdworker",
  "mdworker_shared",
  "coreservicesd",
  "corespotlightd",
  "hidd",
  "cfprefsd",
  "cloudd",
  "bird",
  "trustd",
  "sandboxd",
  "securityd",
  "opendirectoryd",
  "distnoted",
  "rapportd",
  "sharingd",
  "bluetoothd",
  "coreaudiod",
  "mdnsresponder",
  "watchdogd",
  "fseventsd",
  "notifyd",
  "dynamic_pager",
  // Windows
  "system",
  "idle",
  "registry",
  "memory compression",
  "smss.exe",
  "csrss.exe",
  "wininit.exe",
  "winlogon.exe",
  "services.exe",
  "lsass.exe",
  "svchost.exe",
  "dwm.exe",
  "conhost.exe",
  "runtimebroker.exe",
  "sihost.exe",
  "taskhostw.exe",
  "fontdrvhost.exe",
  "ctfmon.exe",
  "explorer.exe",
  "dllhost.exe",
  "wmiprvse.exe",
  "audiodg.exe",
  "spoolsv.exe",
  "msmpeng.exe",
  "securityhealthservice.exe",
  "applicationframehost.exe",
  "startmenuexperiencehost.exe",
  "shellexperiencehost.exe",
  "searchindexer.exe",
]);

// True when the row is OS housekeeping that shouldn't clutter the System tab:
// a well-known system name, a root-owned daemon reparented to pid 1 (launchd
// on macOS, systemd on Linux — they can't be killed from an unprivileged
// dashboard anyway), or an executable living in an OS-owned directory. On
// macOS that's /System, /usr/libexec, /usr/sbin and /sbin (user-installed
// tooling under /usr/local or /opt is NOT matched); on Windows it's directly
// <drive>:\Windows\. None of these can name a dev server, so the exclusion
// applies even when the process listens on a port — AirPlay's ControlCenter
// and friends are exactly the noise the ports-only view wants gone.
function isCommonSystemProcess(row: {
  rawName: string;
  exe: string | null;
  cmd: string | null;
  ppid: number;
  uid?: number;
}): boolean {
  if (COMMON_SYSTEM_NAMES.has(cleanName(row.rawName).toLowerCase())) return true;
  if (row.uid === 0 && row.ppid === 1) return true;
  const paths = [row.exe ?? "", row.rawName, cmdExeToken(row.cmd)];
  if (process.platform === "win32") {
    return paths.some((p) => /^[a-z]:[/\\]windows[/\\]/i.test(p));
  }
  return paths.some((p) =>
    p.startsWith("/System/") ||
    p.startsWith("/usr/libexec/") ||
    p.startsWith("/usr/sbin/") ||
    p.startsWith("/sbin/"),
  );
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
    const rawName = String(p.Name ?? "");
    const cmd = p.CommandLine ? String(p.CommandLine) : null;
    const exe = p.ExecutablePath ? String(p.ExecutablePath) : null;
    const ports = pidPorts.get(pid);
    if (
      isCommonSystemProcess({
        rawName,
        exe,
        cmd,
        ppid: Number(p.ParentProcessId) || 0,
      })
    ) {
      continue;
    }
    out.push({
      pid,
      ppid: Number(p.ParentProcessId) || 0,
      name: cleanName(rawName),
      cmd,
      exe,
      ports,
    });
  }
  return out;
}

// Listening ports on Unix/macOS come from lsof (pid + port per line); if lsof
// is unavailable the map is empty — ports just won't be annotated, the list
// still works.
async function listUnixPorts(): Promise<PortMap> {
  const map: PortMap = new Map();
  try {
    const { stdout } = await pexec("lsof -nP -iTCP -sTCP:LISTEN", {
      maxBuffer: 64 * 1024 * 1024,
    });
    for (const line of stdout.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      const pid = Number(cols[1]);
      // The NAME column ("*:3000", "127.0.0.1:5432") is followed by a
      // "(LISTEN)" state column when a -s filter is in play, so scan back for
      // the last host:port-shaped token instead of assuming a fixed column.
      let port = NaN;
      for (let i = cols.length - 1; i >= 0; i--) {
        const m = /[.:](\d+)$/.exec(cols[i] ?? "");
        if (m) {
          port = Number(m[1]);
          break;
        }
      }
      if (Number.isFinite(pid) && Number.isFinite(port)) {
        addPort(map, pid, port);
      }
    }
  } catch {
    // lsof missing or failed — return an empty map (no port annotation).
  }
  return map;
}

// Unix/macOS: ps-list returns pid/ppid/name, the full command line in `cmd`
// and a best-effort executable path in `path` (empty when unresolvable).
// `comm`-derived names are usually full executable paths on macOS — shorten
// them after the system-process check (which wants the path form for the
// OS-directory rules) and drop OS housekeeping rows.
async function listUnix(): Promise<SystemProcess[]> {
  const [psListMod, pidPorts] = await Promise.all([
    import("ps-list"),
    listUnixPorts(),
  ]);
  const psList = psListMod.default;
  const list = await psList();
  return list
    .filter(
      (p) =>
        !isCommonSystemProcess({
          rawName: p.name,
          exe: p.path || null,
          cmd: p.cmd ?? null,
          ppid: p.ppid,
          uid: p.uid,
        }),
    )
    .map((p) => ({
      pid: p.pid,
      ppid: p.ppid,
      name: cleanName(p.name),
      cmd: p.cmd ?? null,
      exe: p.path || null,
      ports: pidPorts.get(p.pid),
    }));
}

// Find the process(es) listening on a given TCP port (the toolbar "view port"
// lookup). Uses find-process, which maps port → pid across platforms. Returns
// SystemProcess-shaped rows so the caller can reuse the same info dialog.
// Names are shortened like the full listing, but no system-process filtering
// happens here: an explicit port lookup must resolve whoever owns the port.
export async function findProcessByPort(
  port: number,
): Promise<SystemProcess[]> {
  const list = await findProcess("port", port);
  if (!Array.isArray(list)) return [];
  return list.map((p) => ({
    pid: p.pid,
    ppid: p.ppid ?? 0,
    name: cleanName(p.name ?? ""),
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
