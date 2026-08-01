# dashboard 架构总览

procm-mcp 的 Web UI，由后端在 `GET /` 静态托管。独立的 React + Vite 工程（独立 `package.json`），构建产物 `dashboard/dist` 被打包进 npm 包，由 `src/dashboard-html.ts` 提供服务。

## 技术栈

- **React 19** + **Vite 6**（`@vitejs/plugin-react`）。
- **Tailwind CSS v4**（`@tailwindcss/vite` 插件，非 PostCSS）。
- **coss** UI 组件（基于 `@base-ui/react` 原语），vendored 在 `src/registry/default/ui/`。
- **lucide-react** 图标；**@tanstack/react-table**（`ProcessList` 表格）。
- 样式工具 `class-variance-authority` + `clsx` + `tailwind-merge`（`cn()` 在 `registry/default/lib/utils.ts`）。

## 与后端的契约

- 实时更新走**同源** WebSocket `/ws`（`src/lib/ws.ts`，自动重连指数退避），不经 REST 轮询。
- 操作与历史拉取走同源 REST `/api/*`（`src/lib/api.ts`），不直连 `/mcp`。
- 类型镜像后端 `toPublicRecord`：`src/lib/types.ts` 的 `ProcessView`（含 `startedAt?`/`stoppedAt?`）/ `ProcessListResponse` / `LogsResponse` / `WsProcessesMessage` / `WsLogMessage`。
- dashboard 是**人类驱动的本地 UI**，`POST /api/processes` 启动进程**绕过 allow-x**（等价于在终端敲命令）。

## 核心数据流

```
后端 dashboardEvents ──WebSocket /ws──▶ useDashboardSocket (lib/ws.ts)
                                            │ onProcessesMessage ──▶ setData（进程列表）
                                            │ onLogMessage ──▶ 转发给打开的 LogPanel 或 +未读计数
操作（start/stop/restart/clear-all）──REST──▶ lib/api ──▶ 后端
                                            └─▶ 后端状态变更再经 WS 回推（无需前端手动刷新）
```

WS 连接即发进程快照（含历史停止/退出记录），之后进程状态变更与每条新日志实时推送。日志推送立即转发给当前打开的 LogPanel；未打开的进程累加未读徽标。

## 布局设计取舍

- **默认暗色**：`main.tsx` 在渲染前 `initTheme()`（读 `localStorage["procm-theme"]`，缺省 dark，避免首屏闪烁），`<html>` 加 `dark` class。
- **双 Tab 布局**：header 下是 Processes（进程表格）与 Favorites（收藏夹网格）两个客户端 Tab，切换纯前端。
- **左右分栏而非浮层**：选中某进程的 Logs 时，`LogPanel` 作为**内联右栏**挤压左侧（flex split，max 640px/46vw），不是 drawer/overlay。关闭后保留选中态，右侧出现一条窄 rail（`PanelLeftOpenIcon`）可重开。
- **未读徽标**：每进程维护未读日志计数，打开其 LogPanel 时清零（`unread` state + `openLogIdRef`）。
- **header 状态条**：WS 连接状态指示灯（绿/黄/红）+ 后端 uptime（每秒 tick 计算）。
- **Toast 内联实现**：`Toast.tsx` 不是 coss toast 原语——为单一消息避免引入 toastManager/provider，key 强制重渲染。

## Favorites（纯前端概念）

收藏是「启动配方」（script+args+cwd+envs+desc）+ 可选分类，**只存 localStorage**（`procm-favorites`），与后端进程记录无关，可随时重发。支持：从进程行点星收藏、卡片编辑/删除、按分类分组、文件夹导入（调后端 `/api/favorites/scan` 扫描项目清单）、分组打开文件夹（调 `/api/open-folder`）。去重按启动签名（`script\0args\0cwd`）。

## 主题 token 策略（重要）

`src/index.css` **不使用** coss 官方主题的 `color-mix()` / `oklch()` / `--alpha()`——因为在某些 Chromium 内核上解析不一致（整页背景偏蓝）。所有 token 改用**显式 hex/rgb**，`:root`（亮）+ `.dark`（暗）两套，渲染跨浏览器一致。
