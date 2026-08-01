import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { inspectorServer } from "@react-dev-inspector/vite-plugin";

// In dev (npm run dev, port 5173) the dashboard talks to the backend on a
// different origin. Proxy the API, MCP, dashboard assets, and the /ws
// WebSocket upgrade to the backend so the SPA can keep using same-origin
// relative URLs. Override the target with PROCM_DEV_BACKEND
// (e.g. http://127.0.0.1:7331). In production the backend serves everything
// itself and this proxy is unused.
const devBackend =
  process.env.PROCM_DEV_BACKEND || "http://127.0.0.1:7331";

export default defineConfig(({ mode }) => ({
  plugins: [
    // The babel plugin injects data-inspector-relative-path/-line/-column
    // attributes onto JSX nodes in dev, so clicking an element in the browser
    // can resolve back to its source file. It must run only in dev — otherwise
    // it bloats the production bundle with these attributes on every JSX node.
    // Pair with inspectorServer() below, which serves the
    // /__open-stack-frame-in-editor route that launches the editor (configured
    // via the REACT_EDITOR env var). inspectorServer() is dev-only by design.
    react({
      babel: {
        plugins:
          mode === "development" ? ["@react-dev-inspector/babel-plugin"] : [],
      },
    }),
    tailwindcss(),
    inspectorServer(),
  ],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": devBackend,
      "/mcp": devBackend,
      "/assets": devBackend,
      "/ws": {
        target: devBackend,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
