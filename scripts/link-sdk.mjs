#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sdkDir = resolve(here, "..", "packages", "procm-sdk");
const skipBuild = process.argv.includes("--no-build");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args) {
  const result = spawnSync(npm, args, { cwd: sdkDir, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!skipBuild) run(["run", "build"]);

const entry = resolve(sdkDir, "dist", "index.js");
if (!existsSync(entry)) {
  console.error(`Expected SDK build output not found: ${entry}`);
  console.error("Run without --no-build or build @procm-mcp/sdk first.");
  process.exit(1);
}

run(["link"]);
console.log("\nLinked @procm-mcp/sdk globally.");
console.log("In a consumer project run: npm link @procm-mcp/sdk");
