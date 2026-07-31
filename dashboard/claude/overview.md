# dashboard 架构总览

procm-mcp 的 Web UI，由后端在 `GET /` 静态托管。独立的 React + Vite 工程（独立 `package.json`），构建产物 `dashboard/dist` 被打包进 npm 包，由 `src/dashboard-html.ts` 提供服务。

## 技术栈

- **React 19** + **Vite 6**（`@vitejs/plugin-react`）。
- **Tailwind CSS v4**（`@tailwindcss/vite` 插件，非 PostCSS）。
- **coss** UI 组件（基于 `@base-ui/react` 原语），vendored 在 `src/registry/default/ui/`。
- **lucide-react** 图标。
- 样式工具 `class-variance-authority` + `clsx` + `tailwind-merge`（`cn()` 在 `registry/default/lib/utils.ts`）。

## 与后端的契约

- 所有调用走**同源** REST `/api/*`（`src/lib/api.ts`），不直连 `/mcp`。
- 类型镜像后端 `toPublicView`：`src/lib/types.ts` 的 `ProcessView` / `ProcessListResponse` / `LogsResponse` / `StartProcessBody`。
- dashboard 是**人类驱动的本地 UI**，`POST /api/processes` 启动进程**绕过 allow-x**（等价于在终端敲命令）——这一点在 `NewProcessDialog` 的描述文案里也明确写出。

## 布局设计取舍

- **默认暗色**：`main.tsx` 在渲染前 `initTheme()`（读 `localStorage["procm-theme"]`，缺省 dark，避免首屏闪烁），`<html>` 加 `dark` class。
- **左右分栏而非浮层**：选中某进程的 Logs 时，`LogPanel` 作为**内联右栏**挤压左侧 `ProcessList`（flex split），不是 drawer/overlay。关闭后保留选中态，右侧出现一条窄 rail（`PanelLeftOpenIcon`）可重开。
- **Toast 内联实现**：`Toast.tsx` 不是 coss toast 原语——为单一消息避免引入 toastManager/provider 的重 wiring，2.8s 自动消失。
- **轮询刷新**：`App.tsx` 支持「auto (3s)」自动刷新开关；手动 Refresh 按钮；`refresh()` 同步更新选中的日志目标（按 id 从最新列表找回）。

## 主题 token 策略（重要）

`src/index.css` **不使用** coss 官方主题的 `color-mix()` / `oklch()` / `--alpha()`——因为在某些 Chromium 内核上解析不一致（整页背景偏蓝）。所有 token 改用**显式 hex/rgb**，`:root`（亮）+ `.dark`（暗）两套，渲染跨浏览器一致。
