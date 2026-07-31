#!/usr/bin/env node
// Build procm-mcp and register it globally so `procm-mcp` works from any shell.
//
// What it does:
//   1. `npm run build`  → compile TypeScript into ./build
//   2. `npm link`       → create the global `procm-mcp` command pointing here
//                         (a symlink/junction, so every rebuild is picked up
//                          automatically — no re-link needed)
//   3. Ensure the npm global bin dir is on PATH (warn or fix on Windows)
//
// Usage:
//   node scripts/link-global.mjs          # build + link
//   node scripts/link-global.mjs --no-build  # link only, skip the build
//
// After it succeeds, open a NEW terminal and run:
//   procm-mcp --help

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const skipBuild = process.argv.includes("--no-build");

function run(cmd, args, opts = {}) {
  // Inherit stdio so build/link output streams to the operator.
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: true, ...opts });
  if (result.status !== 0) {
    console.error(`\n✗ Command failed: ${cmd} ${args.join(" ")} (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  return result;
}

function npmGlobalBin() {
  // `npm config get prefix` is the dir that holds the global bin shims.
  const r = spawnSync("npm", ["config", "get", "prefix"], {
    encoding: "utf8",
    shell: true,
  });
  return r.stdout.trim();
}

console.log("▸ Step 1/3: Build");
if (skipBuild) {
  console.log("  (skipped via --no-build)");
} else {
  run("npm", ["run", "build"], { cwd: projectRoot });
}

// Sanity: the bin target must exist after build.
const binTarget = resolve(projectRoot, "build", "index.js");
if (!existsSync(binTarget)) {
  console.error(`\n✗ Expected bin target not found: ${binTarget}`);
  console.error("  Check the `bin` field in package.json and that the build succeeded.");
  process.exit(1);
}

console.log("\n▸ Step 2/3: Register globally (npm link)");
run("npm", ["link", "."], { cwd: projectRoot });

console.log("\n▸ Step 3/3: Verify global command is reachable");
const globalBin = npmGlobalBin();
console.log(`  npm global bin dir: ${globalBin}`);

// Read the PERSISTENT PATH (registry on Windows), not just this process's PATH.
// A shell may inject the npm bin dir into the current process without it being
// persisted, which would let `where` succeed here but fail in a brand-new cmd.
function persistentPath() {
  if (process.platform !== "win32") {
    return process.env.PATH || "";
  }
  // User + Machine PATH from the registry (what a freshly launched cmd sees).
  const ps =
    "$u=[Environment]::GetEnvironmentVariable('Path','User');" +
    "$m=[Environment]::GetEnvironmentVariable('Path','Machine');" +
    "Write-Output ($m + ';' + $u)";
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
    encoding: "utf8",
    shell: true,
  });
  return r.status === 0 ? r.stdout.trim() : process.env.PATH || "";
}

const pathSep = process.platform === "win32" ? ";" : ":";
const norm = (d) => d.toLowerCase().replace(/[\\/]+$/, "");
const persistentDirs = persistentPath().split(pathSep).filter(Boolean);
const onPersistentPath = persistentDirs.some((d) => norm(d) === norm(globalBin));

if (onPersistentPath) {
  // Confirm the shim actually resolves in the current shell.
  const which = spawnSync(
    process.platform === "win32" ? "where" : "command",
    process.platform === "win32" ? ["procm-mcp"] : ["-v", "procm-mcp"],
    { encoding: "utf8", shell: true },
  );
  if (which.status === 0 && which.stdout.trim()) {
    console.log(`  ✓ procm-mcp resolves to: ${which.stdout.trim().split(/\r?\n/)[0]}`);
    console.log("\nDone. Open a NEW terminal and run: procm-mcp --help");
  } else {
    console.log("  ! On persistent PATH, but not found in this shell (restart your terminal).");
  }
  process.exit(0);
}

// Global bin dir is NOT on the persistent PATH.
console.log(`  ✗ The npm global bin dir is NOT on your (persistent) PATH.`);
if (process.platform === "win32") {
  console.log(`  Adding it to the user PATH: ${globalBin}`);
  console.log("  (Writes the registry via PowerShell; does NOT affect this terminal.)");
  // PowerShell append-only-if-missing — avoids duplicates and the setx 1024-char limit.
  const ps = [
    `$bin = '${globalBin.replace(/'/g, "''")}'`,
    `$cur = [Environment]::GetEnvironmentVariable('Path','User')`,
    `if (-not $cur) { $cur = '' }`,
    `if ($cur.Split(';') -notcontains $bin) {`,
    `  $new = ($(if($cur){$cur.TrimEnd(';')}) + ';' + $bin).TrimStart(';')`,
    `  [Environment]::SetEnvironmentVariable('Path', $new, 'User')`,
    `  Write-Output 'added'`,
    `} else { Write-Output 'already-present' }`,
  ].join("; ");
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
    encoding: "utf8",
    shell: true,
  });
  const out = r.stdout.trim();
  if (r.status === 0) {
    console.log(`  ✓ ${out === "already-present" ? "(already present in User PATH)" : "Added to User PATH."}`);
    console.log("\nDone. CLOSE all terminals and open a NEW one, then run: procm-mcp --help");
  } else {
    console.error("  PowerShell update failed. Add it manually: System → Environment Variables → Path.");
    process.exit(1);
  }
} else {
  console.log(`  Add this to your shell rc (e.g. ~/.bashrc / ~/.zshrc):`);
  console.log(`    export PATH="${globalBin}:$PATH"`);
  console.log("\nThen reload (e.g. source ~/.bashrc) and run: procm-mcp --help");
}
