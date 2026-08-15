import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assert,
  buildIndex,
  projectRoot,
  randomPort,
  runTest,
  sleep,
  summarize,
} from "./_helpers.mjs";

await runTest("--data-path overrides PROCM_MCP_DIR", async () => {
  const root = mkdtempSync(join(tmpdir(), "procm-mcp-data-path-"));
  const envDataPath = join(root, "from-env");
  const cliDataPath = join(root, "from-cli");
  const port = randomPort();
  const child = spawn(
    "node",
    [buildIndex, "--server", "--port", String(port), "--data-path", cliDataPath],
    {
      cwd: projectRoot,
      env: { ...process.env, PROCM_MCP_DIR: envDataPath },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  try {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && !existsSync(join(cliDataPath, "processes.json"))) {
      if (child.exitCode !== null) throw new Error(`backend exited with code ${child.exitCode}`);
      await sleep(100);
    }
    assert(existsSync(join(cliDataPath, "processes.json")), "CLI data directory contains processes.json");
    assert(!existsSync(envDataPath), "environment data directory remains unused");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(3000),
    ]);
    rmSync(root, { recursive: true, force: true });
  }
});

await runTest("default data path is the process working directory", async () => {
  const root = mkdtempSync(join(tmpdir(), "procm-mcp-data-default-"));
  const port = randomPort();
  const child = spawn("node", [buildIndex, "--server", "--port", String(port)], {
    cwd: root,
    env: { ...process.env, PROCM_MCP_DIR: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const deadline = Date.now() + 8000;
    const dataDir = join(root, ".procm-mcp");
    while (Date.now() < deadline && !existsSync(join(dataDir, "processes.json"))) {
      if (child.exitCode !== null) throw new Error(`backend exited with code ${child.exitCode}`);
      await sleep(100);
    }
    assert(existsSync(join(dataDir, "processes.json")), ".procm-mcp contains processes.json");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(3000),
    ]);
    rmSync(root, { recursive: true, force: true });
  }
});

summarize();
