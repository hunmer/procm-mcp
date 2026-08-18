#!/usr/bin/env node
import { build } from "../dashboard/node_modules/esbuild/lib/main.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

await build({
  entryPoints: [resolve(root, "packages/procm-sdk/src/browser.ts")],
  outfile: resolve(root, "packages/procm-sdk/dist/browser.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  sourcemap: true,
  minify: false,
  legalComments: "eof",
});
