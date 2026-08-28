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

await runTest("GET /api/processes filters by group/status/search", async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const body = (name, group, args) => ({
    script: "node",
    args,
    cwd: projectRoot,
    name,
    group,
  });
  // One long-running process in group "alpha", one quickly-exiting in "beta".
  const keep = await http(port, "POST", "/api/processes", body(
    "filter-keep", "alpha", ["-e", "setInterval(()=>{},1000)"],
  ));
  const gone = await http(port, "POST", "/api/processes", body(
    "filter-gone", "beta", ["-e", ""],
  ));
  assertEqual(keep.status, 201, "start alpha");
  assertEqual(gone.status, 201, "start beta");
  // Give the empty-script process time to be recorded as exited.
  await sleep(600);

  const byGroup = await http(port, "GET", "/api/processes?group=alpha");
  assert(byGroup.data.processes.length > 0, "group filter non-empty");
  assert(byGroup.data.processes.every((p) => p.group === "alpha"), "group filter");
  assert(byGroup.data.processes.some((p) => p.id === keep.data.id), "group contains keep");

  const byStatus = await http(port, "GET", "/api/processes?status=exited");
  assert(byStatus.data.processes.every((p) => p.status === "exited"), "status filter");
  assert(byStatus.data.processes.some((p) => p.id === gone.data.id), "status contains gone");

  const bySearch = await http(port, "GET", "/api/processes?search=FILTER-KEEP");
  assert(bySearch.data.processes.some((p) => p.id === keep.data.id), "search matches name");
  assert(!bySearch.data.processes.some((p) => p.id === gone.data.id), "search excludes other");

  const combined = await http(port, "GET", "/api/processes?group=alpha&status=running");
  assert(combined.data.processes.some((p) => p.id === keep.data.id), "combined keeps");
  assert(!combined.data.processes.some((p) => p.id === gone.data.id), "combined drops");

  await http(port, "DELETE", "/api/processes", { ids: [keep.data.id, gone.data.id] });
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

await runTest("POST start enforces unique names and explicit replacement", async () => {
  const body = {
    script: "node",
    args: ["-e", "setInterval(()=>{},1000)"],
    cwd: projectRoot,
    name: "unique-name-check",
  };
  const first = await http(port, "POST", "/api/processes", body);
  assertEqual(first.status, 201, "first named start");

  const duplicate = await http(port, "POST", "/api/processes", body);
  assertEqual(duplicate.status, 409, "duplicate named start rejected");
  assert(duplicate.data.error.includes("overwrite=true"), "duplicate explains overwrite");

  const withoutRestart = await http(port, "POST", "/api/processes", { ...body, overwrite: true });
  assertEqual(withoutRestart.status, 409, "running replacement requires restart");
  assert(withoutRestart.data.error.includes("restart=true"), "running replacement explains restart");

  const replaced = await http(port, "POST", "/api/processes", { ...body, overwrite: true, restart: true });
  assertEqual(replaced.status, 201, "running named process replaced");
  const listed = await http(port, "GET", "/api/processes?search=unique-name-check");
  assertEqual(listed.data.processes.filter((p) => p.name === body.name).length, 1, "only one named record remains");
  await http(port, "DELETE", "/api/processes", { ids: [replaced.data.id] });
});

await runTest("PATCH process favorite persists in REST and list views", async () => {
  const started = await http(port, "POST", "/api/processes", {
    script: "node",
    args: ["-e", "setInterval(()=>{},1000)"],
    cwd: projectRoot,
    name: "favorite-persistence-check",
  });
  assertEqual(started.status, 201, "favorite fixture start");
  const patched = await http(port, "PATCH", `/api/processes/${started.data.id}`, { favorite: true });
  assertEqual(patched.status, 200, "favorite patch status");
  assertEqual(patched.data.favorite, true, "favorite patch response");
  const listed = await http(port, "GET", "/api/processes?search=favorite-persistence-check");
  assertEqual(listed.data.processes.find((p) => p.id === started.data.id).favorite, true, "favorite in list");
  await http(port, "DELETE", "/api/processes", { ids: [started.data.id] });
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
