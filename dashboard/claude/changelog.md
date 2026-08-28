# dashboard 索引变更记录

> 仅记录本索引体系的生成/更新，保留最近 5 条，倒序。

## 2026-08-25 — 增量更新（favorites 迁移服务端 + 四 Tab + 组件子目录化）

- **背景**：8-15 后 dashboard 落地多批功能。**favorites 迁移**：`lib/favorites.ts` 删除，收藏改为进程记录的服务端字段 `ProcessView.favorite`（`PATCH /api/processes/:id`，`setProcessFavorite`）；导入类操作改走 `POST /api/processes/import`（SettingsDialog 单条）与 `POST /api/processes/import-batch`（批量），`POST /api/favorites/scan` 仍用于目录扫描候选。**App 改四 Tab**：processes（分组列表 + LogPanel）、system、history（`LogFilesView` 落盘日志）、playground（HTTP API 游乐场：`playground/catalog.ts` 32 端点 6 组，zod 校验表单 + JsonViewer + 复制 curl）。**组件子目录化**：`LogPanel` 拆出 `log-panel/`（9 文件，含 StdinBar/ViewSettings/CommandStrip）、`process-list/` 重构为 11 文件（分组卡片列表，去表格/分页，新增 `RenameGroupDialog`）、`system-process/` 11 文件。**api.ts 新增**：updateProcess（`{group}` 整组重命名）、clearProcessLogs、server-log 三件套（GET/PUT/DELETE `/api/server-log*`）、log-files 三件套（`/api/log-files`、`/api/log-files/content`、DELETE）、导入两条、selectDirectory。**lib/ 现 8 文件**（favorites.ts 移除）；WS 增加 `logCleared` 回调 + 30s HTTP 轮询兜底；locales 16 个顶层域新增 `logFiles.*`/`playground.*` 等；新依赖 `zod`/`i18next`/`react-i18next`/`@hunmer/procm-mcp-sdk`（file: 引用）。
- **更新**：全部 11 个详情文件 + `CLAUDE.md`（简介/约定/扫描状态）；`module-responsibilities.md`/`file-map.md` 按新目录结构重写；`public-interfaces.md` 补全 REST 清单与 17 字段 `ProcessView`；`data-model.md` 收录 localStorage 键（`procm.collapsedGroups`/`procm.pinnedProcesses`/`procm-log-show-json`/`procm.sys*`）。
- **覆盖**：本轮经代理细读 `App.tsx`、`playground/`（Playground+catalog）、`log-panel/`（9 文件）、`process-list/`（11 文件，含 RenameGroupDialog）、`system-process/`（11 文件）、`SettingsDialog.tsx`、`ProcessFilterBar`、`lib/`（8 文件）、`types.ts`、`locales/{en,zh}.json`、`package.json`。
- **未逐行（结构级）**：`registry/default/ui/`（vendored）、`NewProcessDialog.tsx`/`LogFilesView.tsx` 等其余编排组件。

## 2026-08-15 — 增量更新（process-list 重构 + System Tab + i18n + 终端日志）

- **背景**：8-01 全量重写后 dashboard 又落地多批功能：`ProcessList` 拆分为 `components/process-list/` 组合式子域（13 文件，表格/卡片双视图、过滤、分页、排序、右键菜单、批量操作）；新增 `SystemProcessList`（System Tab，OS 进程查看/kill）、`TerminalLog` + `ansi.ts`（ANSI 终端日志渲染）、`JsonViewer`（结构化日志 data 展开）、`lib/urlState.ts`（URL 选中/折叠同步）、i18n（`i18n.ts` + `locales/{en,zh}.json` + `lib/useLanguage.ts` + react-i18next）；`lib/api.ts` 开始依赖 `@hunmer/procm-mcp-sdk` 解码结构化日志。
- **更新**：`module-responsibilities.md`、`file-map.md` 重写补齐以上；`CLAUDE.md` 简介与扫描状态同步。
- **覆盖**：新组件按头部注释/导入/导出结构级抽查（未逐行）；`process-list/` 仅结构级。

## 2026-08-14 — 增量更新（移除 allow-x 残留）

- **背景**：后端 allow-x / `allowed-process` 白名单功能已从源码移除，dashboard 文档仍残留 3 处过期引用。dashboard 源码与架构本身无变动，故做增量修正而非全量重写。
- **修正**：`overview.md`、`public-interfaces.md`（`POST /api/processes` 启动不再说「绕过 allow-x」，改为「直接执行」）；`dependencies-and-config.md`（删 `PROCM_ALLOW_ALL`）。
- **确认**：`dashboard/CLAUDE.md` 与其余详情文件无 allow-x 引用，保持不变。

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
