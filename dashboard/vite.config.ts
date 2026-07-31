import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In dev (npm run dev, port 5173) the dashboard talks to the backend on a
// different origin. Proxy the API, MCP, dashboard assets, and the /ws
// WebSocket upgrade to the backend so the SPA can keep using same-origin
// relative URLs. Override the target with PROCM_DEV_BACKEND
// (e.g. http://127.0.0.1:7331). In production the backend serves everything
// itself and this proxy is unused.
const devBackend =
  process.env.PROCM_DEV_BACKEND || "http://127.0.0.1:7331";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
});
