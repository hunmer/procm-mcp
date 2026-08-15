// Dashboard HTTP API: page served, listing shape, 404s, token auth.
import {
  startBackend,
  stopBackend,
  http,
  randomPort,
  assert,
  assertEqual,
  runTest,
  summarize,
  projectRoot,
} from "./_helpers.mjs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = randomPort();
let backend;

await runTest("GET / serves the dashboard page", async () => {
  backend = await startBackend({ port });
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assertEqual(res.status, 200, "page status");
  const html = await res.text();
  assert(html.includes("<!DOCTYPE html"), "serves HTML");
  assert(html.includes("procm-mcp"), "page mentions procm-mcp");

  const assets = Array.from(
    html.matchAll(/(?:src|href)=["']([^"']+)["']/g),
    (match) => new URL(match[1], `http://127.0.0.1:${port}/`).href,
  );
  assert(assets.length > 0, "dashboard references built assets");
  for (const assetUrl of assets) {
    const assetRes = await fetch(assetUrl);
    assertEqual(assetRes.status, 200, `dashboard asset ${assetUrl}`);
  }
});

await runTest("GET /api/processes returns serverId/pid/[]", async () => {
  const { data, status } = await http(port, "GET", "/api/processes");
  assertEqual(status, 200, "list status");
  assert(typeof data.serverId === "string", "has serverId");
  assert(typeof data.pid === "number", "has pid");
  assert(Array.isArray(data.processes), "processes is array");
});

await runTest("unknown route → 404", async () => {
  const { status } = await http(port, "GET", "/api/nope");
  assertEqual(status, 404, "404 for unknown");
});

await runTest("info on missing id → 404", async () => {
  const { status } = await http(port, "GET", "/api/processes/does-not-exist");
  assertEqual(status, 404, "404 for missing process");
});

await runTest("POST start without script/cwd → 400", async () => {
  const { status, data } = await http(port, "POST", "/api/processes", { script: "" });
  assertEqual(status, 400, "400 for empty script");
  assert(!!data.error, "has error message");
});

await runTest("package scripts use the enclosing pnpm workspace", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "procm-pnpm-workspace-"));
  const packageDir = join(workspace, "packages", "client");
  try {
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({
        scripts: {
          "electron:dev":
            "chcp 65001 && cross-env NODE_ENV=development vite --mode electron",
        },
      }),
    );

    const { status, data } = await http(
      port,
      "POST",
      "/api/favorites/scan",
      { path: packageDir },
    );
    assertEqual(status, 200, "scan status");
    assertEqual(data.candidates?.[0]?.script, "pnpm", "package manager");
    assertEqual(data.candidates?.[0]?.args?.join(" "), "run electron:dev", "script args");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

stopBackend(backend);

// ---- token auth ----
const tport = randomPort();
let tbackend;
await runTest("token required when PROCM_HTTP_TOKEN set", async () => {
  // Start a backend with a token by setting the env then calling startBackend.
  // startBackend doesn't set the token, so do it inline.
  const { spawn } = await import("node:child_process");
  const { buildIndex } = await import("./_helpers.mjs");
  tbackend = spawn(
    "node",
    [buildIndex, "--server", "--port", String(tport)],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PROCM_HTTP_TOKEN: "secret-token" },
    },
  );
  // wait ready
  const { sleep } = await import("./_helpers.mjs");
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${tport}/api/processes`)).ok) break;
    } catch {}
    await sleep(150);
  }
  const noToken = await http(tport, "GET", "/api/processes");
  assertEqual(noToken.status, 401, "401 without token");
  const wrongToken = await http(tport, "GET", "/api/processes", undefined, "wrong");
  assertEqual(wrongToken.status, 401, "401 with wrong token");
  const rightToken = await http(tport, "GET", "/api/processes", undefined, "secret-token");
  assertEqual(rightToken.status, 200, "200 with right token");
});

stopBackend(tbackend);
summarize();
