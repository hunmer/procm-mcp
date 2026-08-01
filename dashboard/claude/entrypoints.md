# dashboard 入口与启动

## 入口

- **HTML**：`dashboard/index.html` — 单 `<div id="root">` + `<script type="module" src="/src/main.tsx">`。
- **JS**：`dashboard/src/main.tsx` — React 渲染入口。
- **构建产物**：`dashboard/dist/index.html` + `dist/assets/*`（由后端 `dashboard-html.ts` 托管）。

## 启动流程（浏览器侧）

1. 后端 `GET /` 返回 `dist/index.html`（Vite 产出，`base: "./"` 使资源 URL 相对，健壮于挂载路径）。
2. 浏览器加载 `/assets/index-*.js`（React + 组件 bundle）。
3. `main.tsx` 执行：`initTheme()` 先于渲染应用 `<html>` 的 `dark` class（读 `localStorage["procm-theme"]`，缺省 dark），避免主题闪烁（FOUC）。
4. `createRoot(#root).render(<StrictMode><App/></StrictMode>)`。
5. `App` 挂载后：`useDashboardSocket` 立即建 WS `/ws` → 连接即收进程快照（`onProcessesMessage` 填 `data` + `serverStartedAt`）。无需手动 refresh；uptime 由每秒 tick 的 `now` 与 `serverStartedAt` 计算。

## 构建流程

- `npm run build`（在 `dashboard/`）= `tsc -b`（类型检查，`tsconfig` 的 `noEmit: true`）+ `vite build` → `dist/`。
- 从项目根用 `npm run build:dashboard`（`npm --prefix dashboard run build`）。
- `vite.config.ts`：`plugins: [react(...), tailwindcss(), inspectorServer()]`、`base: "./"`、`resolve.alias @ → ./src`、`server.proxy`（dev）、`build.outDir: dist`、`emptyOutDir: true`。dev 模式注入 `@react-dev-inspector/babel-plugin`（生产不注入，避免 bundle 膨胀）。

## 托管解析（后端侧，见根 `dashboard-html.ts`）

后端按顺序找 `dashboard/dist`：
1. `build/dashboard-html.js` 同级的 `../../dashboard/dist`（npm 包内）。
2. `process.cwd()/dashboard/dist`（源码运行回退）。
找到 `index.html` + `assets/` 即视为可用；否则 `GET /` 返回「未构建」提示页，`/assets/*` 404，但 REST/WS 仍可用。会把 Vite 的 `<!doctype html>` 规范化为大写 `<!DOCTYPE html>`。

## dev 模式

`npm run dev:dashboard`（或 `dashboard/` 内 `npm run dev`）起 Vite dev server（默认 5173，HMR）。`vite.config.ts` **已配 proxy**：`/api`、`/mcp`、`/assets` 转发到 `PROCM_DEV_BACKEND`（默认 `http://127.0.0.1:7331`，可改环境变量），`/ws` 走 WebSocket proxy。流程：先起后端（`npm run start:server`），再起 dev server。配合 `@react-dev-inspector`，dev 模式点击元素可打开源码（`REACT_EDITOR` 配置编辑器）。
