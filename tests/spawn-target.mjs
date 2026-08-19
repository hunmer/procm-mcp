import { resolveSpawnTarget, shouldIgnoreStdin } from "../build/process-manager.js";
import { assert, assertEqual, summarize } from "./_helpers.mjs";

if (process.platform === "win32") {
  const target = resolveSpawnTarget("pnpm", process.cwd());
  assertEqual(target.shell, false, "Windows package-manager executables bypass cmd.exe shell semantics");
  assertEqual(target.command.toLowerCase().endsWith("pnpm.exe"), true, "pnpm resolves to the executable selected from PATH");
  assertEqual(shouldIgnoreStdin("pnpm", ["run", "dev"]), true, "pnpm run uses detached stdin");
  assertEqual(shouldIgnoreStdin("npm", ["run", "dev"]), true, "npm run uses detached stdin");
  assertEqual(shouldIgnoreStdin("node", ["server.js"]), false, "node keeps writable stdin");
} else {
  console.log("Skipping Windows spawn target assertions on non-Windows platform.");
}

summarize();
