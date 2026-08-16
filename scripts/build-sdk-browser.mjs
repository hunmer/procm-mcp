#!/usr/bin/env node
import { build } from "../dashboard/node_modules/esbuild/lib/main.js";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);

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
