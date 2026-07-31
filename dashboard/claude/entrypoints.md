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
5. `App` 挂载后 `useEffect` 调 `refresh()` → `listProcesses()` → `GET /api/processes` 首次拉取。

## 构建流程

- `npm run build`（在 `dashboard/`）= `tsc -b`（类型检查，`tsconfig` 的 `noEmit: true`）+ `vite build` → `dist/`。
- 从项目根用 `npm run build:dashboard`（`npm --prefix dashboard run build`）。
- `vite.config.ts`：`plugins: [react(), tailwindcss()]`、`base: "./"`、`resolve.alias @ → ./src`、`build.outDir: dist`、`emptyOutDir: true`。

## 托管解析（后端侧，见根 `dashboard-html.ts`）

后端按顺序找 `dashboard/dist`：
1. `build/dashboard-html.js` 同级的 `../../dashboard/dist`（npm 包内）。
2. `process.cwd()/dashboard/dist`（源码运行回退）。
找到 `index.html` + `assets/` 即视为可用；否则 `GET /` 返回「未构建」提示页，`/assets/*` 404，但 REST API 仍可用。会把 Vite 的 `<!doctype html>` 规范化为大写 `<!DOCTYPE html>`。

## dev 模式

`npm run dev:dashboard`（或 `dashboard/` 内 `npm run dev`）起 Vite dev server（默认 5173，HMR）。因 API 是同源 `/api/...`，需后端可达——当前 `vite.config.ts` 未配 proxy，建议直接 build 后由后端托管来开发（见 conventions）。
