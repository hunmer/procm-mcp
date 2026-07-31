// Serves the built React + coss dashboard (dashboard/dist).
//
// The dashboard is a separate Vite project (see ../dashboard). Run
// `npm run build:dashboard` to produce dashboard/dist before it can be served.
// When dist is missing, GET / falls back to a short instruction page so the
// server still returns a usable 200 instead of crashing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the dashboard dist directory.
// `build/` and `dashboard/` are sibling dirs under the package root, so from
// build/<this file> the dist is one level up: ../dashboard/dist.
// Also try process.cwd()-relative as a fallback for ad-hoc runs from a checkout.
function resolveDashboardDist(): string | undefined {
  const candidates = [
    path.resolve(__dirname, "..", "dashboard", "dist"),
    path.resolve(process.cwd(), "dashboard", "dist"),
  ];
  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "index.html")) &&
      fs.existsSync(path.join(candidate, "assets"))
    ) {
      return candidate;
    }
  }
  return undefined;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

export interface DashboardAsset {
  body: Buffer;
  contentType: string;
}

export interface DashboardServeResult {
  // When the dashboard bundle exists, `index` is the built index.html and
  // `distDir` points at the dist root for serving assets.
  distDir?: string;
  index?: string;
  // Whether the built dashboard is available at all.
  available: boolean;
}

export function getDashboardServeState(): DashboardServeResult {
  const distDir = resolveDashboardDist();
  if (!distDir) {
    return { available: false };
  }
  let indexHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  // Vite emits a lowercase `<!doctype html>`; normalize the declaration so the
  // served page matches the conventional uppercase `<!DOCTYPE html>`.
  if (indexHtml.startsWith("<!doctype html>")) {
    indexHtml = "<!DOCTYPE html>" + indexHtml.slice("<!doctype html>".length);
  }
  return { available: true, distDir, index: indexHtml };
}

// Read an asset under the dashboard dist directory (e.g. /assets/index-*.js).
// Returns undefined if the path escapes dist or the file does not exist.
export function readDashboardAsset(
  distDir: string,
  assetPath: string,
): DashboardAsset | undefined {
  // Normalize and prevent path traversal outside dist.
  const cleaned = path
    .normalize(assetPath)
    .replace(/^([/\\]|[a-zA-Z]:)[/\\]?/, "")
    .replace(/\.\.+/g, "");
  const fullPath = path.resolve(distDir, cleaned);
  if (!fullPath.startsWith(path.resolve(distDir))) {
    return undefined;
  }
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return undefined;
  }
  const ext = path.extname(fullPath).toLowerCase();
  return {
    body: fs.readFileSync(fullPath),
    contentType: MIME[ext] ?? "application/octet-stream",
  };
}

// Fallback page shown when the dashboard has not been built yet.
export function dashboardNotBuiltHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>procm-mcp dashboard</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f1115; color: #e6e8eb; margin: 0; padding: 48px 24px; }
  .card { max-width: 560px; margin: 0 auto; background: #171a21; border: 1px solid #2a2f3a; border-radius: 10px; padding: 24px; }
  h1 { margin: 0 0 8px; font-size: 18px; }
  p { color: #8a93a3; font-size: 14px; line-height: 1.6; margin: 12px 0; }
  code { background: #1f232c; border: 1px solid #2a2f3a; border-radius: 6px; padding: 2px 6px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; color: #e6e8eb; }
  .cmd { display: block; margin: 12px 0; padding: 12px; background: #0b0d12; border: 1px solid #2a2f3a; border-radius: 8px; white-space: pre-wrap; word-break: break-all; }
</style>
</head>
<body>
  <div class="card">
    <h1>procm-mcp dashboard</h1>
    <p>The dashboard frontend has not been built yet. Build it from the project root, then reload this page:</p>
    <code class="cmd">npm run build:dashboard</code>
    <p>The HTTP API is still available at <code>/api/processes</code>.</p>
  </div>
</body>
</html>`;
}
