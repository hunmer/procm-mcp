import { readFile, stat } from "fs/promises";
import path from "path";

// Stateless project-config scanner. Given a folder path, reads its top-level
// project manifest files (package.json / pyproject.toml / Cargo.toml /
// procm-commands.json) and derives a list of launchable commands the dashboard
// can import as favorites.
//
// This is purely advisory metadata: it never writes anything and never recurses
// into subdirectories (the caller passes the exact folder to scan). Failures
// while reading/parsing a single file are tolerated — that file just yields no
// candidates — so a mixed-language folder still returns whatever it can.

export interface ScanCandidate {
  script: string;
  args: string[];
  cwd: string;
  name?: string;
  desc?: string;
}

// Entry point. Resolves with the combined candidate list (possibly empty).
// Throws only for unrecoverable problems with the directory itself (missing,
// not a directory, unreadable) so the HTTP layer can surface a clear error.
export async function scanProjectCommands(
  dir: string,
): Promise<ScanCandidate[]> {
  const resolved = path.resolve(dir.trim());
  const info = await stat(resolved).catch((e) => {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") throw new Error(`Folder not found: ${resolved}`);
    if (code === "ENOTDIR") throw new Error(`Not a folder: ${resolved}`);
    throw e;
  });
  if (!info.isDirectory()) {
    throw new Error(`Not a folder: ${resolved}`);
  }

  const candidates: ScanCandidate[] = [];
  // Read each manifest independently; an unreadable one doesn't abort the rest.
  const [pkg, py, cargo, procm] = await Promise.all([
    readJsonIfExists(path.join(resolved, "package.json")),
    readTextIfExists(path.join(resolved, "pyproject.toml")),
    readTextIfExists(path.join(resolved, "Cargo.toml")),
    readJsonIfExists(path.join(resolved, "procm-commands.json")),
  ]);

  if (pkg) candidates.push(...fromPackageJson(pkg, resolved));
  if (py) candidates.push(...fromPyproject(py, resolved));
  if (cargo) candidates.push(...fromCargo(resolved));
  if (procm) candidates.push(...fromProcmCommands(procm, resolved));

  // De-dup by (script+args+cwd) so a command that appears in two manifests is
  // only offered once.
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const sig = `${c.script}\0${c.args.join(" ")}\0${c.cwd}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

// ---- package.json -------------------------------------------------------

function fromPackageJson(
  pkg: Record<string, unknown>,
  cwd: string,
): ScanCandidate[] {
  const scripts = pkg.scripts;
  if (!scripts || typeof scripts !== "object") return [];
  const out: ScanCandidate[] = [];
  for (const [name, raw] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof raw !== "string") continue;
    // Skip trivially empty entries; everything else becomes `npm run <name>`.
    // We surface the original script string as the description so the user can
    // tell what `dev` actually runs before importing it.
    out.push({
      script: "npm",
      args: ["run", name],
      cwd,
      name,
      desc: raw,
    });
  }
  // Sort alphabetically by script name for a stable, scannable list.
  out.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  return out;
}

// ---- pyproject.toml -----------------------------------------------------
// We only need the two conventional `[project.scripts]` and
// `[tool.poetry.scripts]` tables, both of which map `name = "module:func"` (or
// `name = "callable"`). A full TOML parser would be overkill, so we scan
// section-by-section with a tiny line-oriented parser.

function fromPyproject(text: string, cwd: string): ScanCandidate[] {
  const scriptTables: Record<string, string>[] = [];
  let currentTable: string | null = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    // A table header like [project.scripts] or [tool.poetry.scripts].
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      const name = header[1].trim();
      currentTable =
        name === "project.scripts" || name === "tool.poetry.scripts"
          ? name
          : null;
      continue;
    }
    if (!currentTable) continue;
    // `key = "value"` — value is the entry point spec, not a shell command, so
    // it goes into desc; the launched name is `poetry run <key>` for poetry
    // tables and the bare key for PEP 621 (which installs a console script).
    const m = line.match(/^([\w.-]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    // Strip a trailing inline comment and surrounding quotes.
    val = val.replace(/#.*$/, "").trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!val) continue;
    const isPoetry = currentTable === "tool.poetry.scripts";
    scriptTables.push(
      isPoetry
        ? { name: key, command: "poetry", run: `poetry run ${key}`, desc: val }
        : { name: key, command: key, run: key, desc: val },
    );
  }
  return scriptTables.map((e) => {
    const parts = e.run.split(/\s+/);
    return {
      script: parts[0],
      args: parts.slice(1),
      cwd,
      name: e.name,
      desc: e.desc,
    };
  });
}

// ---- Cargo.toml ---------------------------------------------------------
// Cargo has no per-task manifest; the standard verbs are what you'd want as
// favorites, so we offer the common development ones unconditionally.

function fromCargo(cwd: string): ScanCandidate[] {
  return [
    { script: "cargo", args: ["run"], cwd, name: "run", desc: "cargo run" },
    { script: "cargo", args: ["build"], cwd, name: "build", desc: "cargo build" },
    { script: "cargo", args: ["test"], cwd, name: "test", desc: "cargo test" },
    { script: "cargo", args: ["check"], cwd, name: "check", desc: "cargo check" },
  ];
}

// ---- procm-commands.json ------------------------------------------------
// procm-mcp's own project manifest: a { commands: { name: { script, args?, cwd?,
// envs?, desc? } } } map. The cwd, when relative, is resolved against the
// project folder (same convention the procm-command tool uses at start time)
// so an imported favorite launches from the same directory as it would there.

function fromProcmCommands(
  file: Record<string, unknown>,
  projectDir: string,
): ScanCandidate[] {
  const commands = file.commands;
  if (!commands || typeof commands !== "object") return [];
  const out: ScanCandidate[] = [];
  for (const [name, raw] of Object.entries(
    commands as Record<string, unknown>,
  )) {
    if (!raw || typeof raw !== "object") continue;
    const cmd = raw as Record<string, unknown>;
    const script = typeof cmd.script === "string" ? cmd.script.trim() : "";
    if (!script) continue;
    const args = Array.isArray(cmd.args)
      ? cmd.args.filter((a): a is string => typeof a === "string")
      : [];
    // Resolve a relative cwd against the project dir; default to the dir itself.
    const cwdRaw = typeof cmd.cwd === "string" ? cmd.cwd.trim() : "";
    const cwd = cwdRaw ? path.resolve(projectDir, cwdRaw) : projectDir;
    const desc =
      typeof cmd.desc === "string" && cmd.desc ? cmd.desc : undefined;
    out.push({ script, args, cwd, name, desc });
  }
  // Stable alphabetical order, mirroring fromPackageJson.
  out.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  return out;
}

// ---- helpers ------------------------------------------------------------

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function readJsonIfExists(
  filePath: string,
): Promise<Record<string, unknown> | null> {
  const text = await readTextIfExists(filePath);
  if (text == null) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
