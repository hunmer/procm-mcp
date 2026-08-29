import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const esbuildEntry = resolve(root, "dashboard/node_modules/esbuild/lib/main.js");

try {
  await access(esbuildEntry);
} catch {
  // Dashboard dependencies are installed separately in this repository.
  // Defer the full build until they are available (for example, during npm publish).
  console.warn("[prepare] dashboard dependencies not installed; skipping build");
  process.exit(0);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npm, ["run", "build"], {
  cwd: root,
  stdio: "inherit",
  // npm.cmd is a Windows command shim, not a native executable.
  shell: process.platform === "win32",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
