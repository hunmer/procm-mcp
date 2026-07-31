// Run every test script in sequence and report a combined result.
// Each script exits 0 on success / 1 on failure; we collect exit codes.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const scripts = [
  "lifecycle.mjs",
  "logs-grep.mjs",
  "http-api.mjs",
  "allow-x.mjs",
  "cli-roundtrip.mjs",
];

function run(file) {
  return new Promise((resolveResult) => {
    const child = spawn("node", [resolve(__dirname, file)], {
      stdio: "inherit",
    });
    child.on("exit", (code) => resolveResult({ file, code }));
  });
}

console.log(`Running ${scripts.length} test suite(s)...\n`);
let failed = 0;
for (const s of scripts) {
  console.log(`\n${"=".repeat(50)}\nSuite: ${s}\n${"=".repeat(50)}`);
  const { code } = await run(s);
  if (code !== 0) failed++;
  console.log(`→ ${s}: ${code === 0 ? "PASS" : "FAIL"}`);
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Suites: ${scripts.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
