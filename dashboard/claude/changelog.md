# dashboard 索引变更记录

> 仅记录本索引体系的生成/更新，保留最近 5 条，倒序。

## 2026-08-01 — 全量重写（适配 WebSocket + Favorites 新架构）

- **范围**：dashboard 工程重新全量扫描。
- **重大更正**：前次（2026-07-31）文档基于旧「3s 轮询 + 无 vite proxy」UI，与现状严重脱节。本次据实重写所有 11 个详情文件。
- **关键变更**：
  - 实时更新已改 WebSocket `/ws`（`lib/ws.ts` `useDashboardSocket`，指数退避自动重连），不再轮询。
  - `vite.config.ts` **已配 proxy**（`/api`、`/mcp`、`/assets`、`/ws` → `PROCM_DEV_BACKEND`），dev 跨域已解决。
  - 新增 Favorites 子域：`lib/favorites.ts`（localStorage 收藏 + `useFavorites`）、`lib/presets.ts`（启动预设）、`lib/cwd.ts`（`detectCwd`）；组件 `FavoritesView.tsx`、`ImportFavoritesDialog.tsx`、`DevInspector.tsx`。
  - App 改双 Tab 布局（Processes/Favorites）、未读徽标、批量 clear-all、收藏 launch 后自动选中开日志栏、后端 uptime 显示。
  - LogPanel 增强：grep、合并双流、下载/复制文件位置/复制启动命令、WS 实时追加。
  - ProcessList 改用 `@tanstack/react-table` + 右键菜单。
  - 新增大量 REST 调用（`log-files`/`log-download`/`command`/批量 DELETE/`favorites/scan`/`open-folder`/`meta`）。
  - 依赖新增 `@tanstack/react-table`、`react-dev-inspector`（dev）。
- **覆盖**：`src/main.tsx`、`src/components/*.tsx`（8 个）、`src/lib/*.ts`（7 个，含新增 favorites/presets/cwd/ws）、配置三件套、`index.html`、`README.md`。
- **未详读**：`src/registry/default/ui/*.tsx`（22 个 vendored coss 组件，归纳用法）；`node_modules/`、`dist/`、`tsconfig.tsbuildinfo`。
- **缺口/建议下一步**：(1) 引入 vitest + RTL 测试；(2) REST 客户端支持 token 注入；(3) 评估 WS 重连/未读计数边界。

## 2026-07-31 — 初始生成

- **范围**：dashboard 工程全量扫描。
- **新建**：`dashboard/CLAUDE.md`（轻量索引）+ `dashboard/claude/` 下 11 个详情文件。
- **注意**：此版基于旧轮询架构，已于 2026-08-01 全量重写。
