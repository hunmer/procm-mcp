import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pack = spawnSync(
  "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  { cwd: root, encoding: "utf8", shell: process.platform === "win32" },
);

if (pack.status !== 0) {
  process.stderr.write(pack.stderr || pack.stdout || String(pack.error));
  process.exit(pack.status ?? 1);
}

let files;
try {
  const json = pack.stdout.match(/^\[[\s\S]*?^\]$/m)?.[0];
  files = JSON.parse(json)[0].files.map(({ path }) => path);
} catch (error) {
  console.error(`Unable to inspect npm package contents: ${error.message}`);
  process.exit(1);
}

const requiredFiles = [
  "build/index.js",
  "build/http-server.js",
  "build/dashboard-html.js",
  "dashboard/dist/index.html",
];
const missingFiles = requiredFiles.filter((path) => !files.includes(path));
const hasDashboardScript = files.some(
  (path) => path.startsWith("dashboard/dist/assets/") && path.endsWith(".js"),
);
const hasDashboardStyles = files.some(
  (path) => path.startsWith("dashboard/dist/assets/") && path.endsWith(".css"),
);

if (!hasDashboardScript) missingFiles.push("dashboard/dist/assets/*.js");
if (!hasDashboardStyles) missingFiles.push("dashboard/dist/assets/*.css");

const builtEntry = await readFile(resolve(root, "build/index.js"), "utf8");
const missingMarkers = ["--server", "PROCM_HTTP_PORT"].filter(
  (marker) => !builtEntry.includes(marker),
);

if (missingFiles.length || missingMarkers.length) {
  if (missingFiles.length) {
    console.error(`npm package is missing: ${missingFiles.join(", ")}`);
  }
  if (missingMarkers.length) {
    console.error(`build/index.js is missing: ${missingMarkers.join(", ")}`);
  }
  process.exit(1);
}

console.log(
  `Package verified: ${files.length} files, HTTP server and dashboard included.`,
);
