# dashboard 架构总览

procm-mcp 的 Web UI，由后端在 `GET /` 静态托管。独立的 React + Vite 工程（独立 `package.json`），构建产物 `dashboard/dist` 被打包进 npm 包，由 `src/dashboard-html.ts` 提供服务。

## 技术栈

- **React 19** + **Vite 6**（`@vitejs/plugin-react`）。
- **Tailwind CSS v4**（`@tailwindcss/vite` 插件，非 PostCSS）。
- **coss** UI 组件（基于 `@base-ui/react` 原语），vendored 在 `src/registry/default/ui/`。
- **lucide-react** 图标；**@tanstack/react-table**（`system-process/` 的系统进程表格）。
- **i18next + react-i18next**（en/zh 双语）；**zod**（Playground 请求表单校验）。
- 样式工具 `class-variance-authority` + `clsx` + `tailwind-merge`（`cn()` 在 `registry/default/lib/utils.ts`）。

## 与后端的契约

- 实时更新走**同源** WebSocket `/ws`（`src/lib/ws.ts`，断线自动重连 + 回退倒计时显示），另有 **30s HTTP 轮询兜底**（`GET /api/processes`）。
- 操作与历史拉取走同源 REST `/api/*`（`src/lib/api.ts`），不直连 `/mcp`（Playground Tab 会按目录镜像后端路由，但仍是同源 REST）。
- 类型镜像后端 `toPublicRecord`：`src/lib/types.ts` 的 `ProcessView`（17 字段，含 `group?`/`port?`/`roomId?`/`favorite?` 等）/ `ProcessListResponse` / `LogsResponse` / `ServerLogInfo` / `LogFileSummary` / `WsProcessesMessage` / `WsLogMessage`（含 `logCleared`）。
- dashboard 是**人类驱动的本地 UI**，`POST /api/processes` 启动进程直接执行（等价于在终端敲命令）。

## 核心数据流

```
后端 dashboardEvents ──WebSocket /ws──▶ useDashboardSocket (lib/ws.ts)
                                            │ onProcessesMessage ──▶ setData（进程列表）
                                            │ onLogMessage ──▶ 转发给打开的 LogPanel 或 +未读计数
操作（start/stop/restart/delete/更新收藏或分组）──REST──▶ lib/api ──▶ 后端
                                            └─▶ 后端状态变更再经 WS 回推（无需前端手动刷新；另有 30s HTTP 轮询兜底）
```

WS 连接即发进程快照（含历史停止/退出记录），之后进程状态变更与每条新日志实时推送。日志推送立即转发给当前打开的 LogPanel；未打开的进程累加未读徽标。

## 布局设计取舍

- **默认暗色**：`main.tsx` 在渲染前 `initTheme()`（读 `localStorage["procm-theme"]`，缺省 dark，避免首屏闪烁），`<html>` 加 `dark` class。
- **四 Tab 布局**：header 下是 Processes（进程列表 + 右侧内联日志栏）、System（OS 进程表格）、History（落盘日志文件浏览）、Playground（HTTP API 游乐场）四个客户端 Tab，切换纯前端。
- **左右分栏而非浮层**：选中某进程的 Logs 时，`LogPanel` 作为**内联右栏**挤压左侧（flex split，宽 `min(640px, 46vw)`），不是 drawer/overlay。关闭后保留选中态（`?proc=` 可还原）。
- **未读徽标**：每进程维护未读日志计数，打开其 LogPanel 时清零（`unread` state + `openLogIdRef`）。
- **顶栏状态区**：后端身份 Badge（`port·serverId(pid)`）、running 计数、Clear all / 清空日志两个确认 AlertDialog；后端 uptime 每秒 tick。
- **Toast 内联实现**：`Toast.tsx` 不是 coss toast 原语——为单一消息避免引入 toastManager/provider，key 强制重渲染。

## Favorites（服务端字段，已迁移）

收藏**不再是前端 localStorage 模型**：`lib/favorites.ts` 与 `procm-favorites` key 已删除，收藏状态改为进程记录自身的 `favorite?: boolean` 字段，随 WS 快照/推送一起下发，改动走 `PATCH /api/processes/:id`（`lib/api.ts` 的 `setProcessFavorite`）。取舍：换浏览器/清缓存不再丢收藏，且收藏与进程记录（组、描述等）在同一处生命周期里维护；代价是「收藏一条已删除进程的启动配方」不再可行——该诉求由「导出/导入启动配方」（SettingsDialog，`procm-processes.json`）承接。目录扫描候选（`POST /api/favorites/scan`）仍被 ImportGroupDialog 用于按组批量导入进程记录。

## Playground（HTTP API 游乐场）

`components/playground/`：左栏按类别列端点目录（`catalog.ts`，32 端点、6 组：server/processes/rooms/system/files/logs，镜像后端 `src/http-server.ts` 路由，排除静态 `/`、`/mcp` 与 log-download），右侧 zod 校验表单直接向同源发请求，响应用 `JsonViewer` 树展示，并可复制等价 curl（按 OS 选引号风格）。定位是后端 API 的自文档化调试入口。

## 主题 token 策略（重要）

`src/index.css` **不使用** coss 官方主题的 `color-mix()` / `oklch()` / `--alpha()`——因为在某些 Chromium 内核上解析不一致（整页背景偏蓝）。所有 token 改用**显式 hex/rgb**，`:root`（亮）+ `.dark`（暗）两套，渲染跨浏览器一致。
