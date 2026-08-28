# 索引变更记录（CLAUDE/claude 文档）

> 仅记录本索引体系的生成/更新，与产品 Changelog 分开。保留最近 5 条，倒序。

## 2026-08-25 — 增量更新（server-log 子系统 + /mcp 工具补齐 + dashboard 重构 + SDK clearLogs）

- **背景**：8-17 基线（687a2b8）之后 18 个 fix 提交：`/mcp` 补注册 api-operations 组（10→13 工具）；REST 新增 `GET/PUT/DELETE /api/server-log`、`PATCH /api/processes/:id`（favorite/group 等字段合并）、`POST /api/processes/import`；WS `processes` 消息加 `port`、新增 `logCleared` 广播；`logger.ts` debug.log 大小上限（settings.json > env > 20MB 截断）；`process-manager` 加 `updateProcessFields`/`shouldIgnoreStdin`；`process-logs` 结构化日志渲染；`select-directory` 异步化；dashboard 大重构（favorites 从 localStorage 迁到服务端字段、组件拆 `log-panel/`+`system-process/`+`playground/` 子目录、四 Tab、RenameGroupDialog）；SDK `rest.ts` 增 `clearLogs()`；run-all 11→13 套。
- **更新（根）**：`public-interfaces`（工具数 14/13、+6 REST 端点、WS port/logCleared、PATCH 字段清单）；`module-responsibilities`/`overview`/`data-model`/`dependencies-and-config`/`entrypoints`/`faq`/`conventions`/`file-map`（新子系统职责、settings.json、`PROCM_DEBUG_LOG_MAX_BYTES`、新目录 `documents/`/`examples/`/`handoff/`、13 套测试）；`CLAUDE.md` 工具数与扫描状态同步。
- **更新（dashboard）**：`CLAUDE.md` + `claude/` 11 文件全量刷新（favorites 服务端化、四 Tab、子目录化组件清单、api.ts 新调用、17 字段 ProcessView、依赖版本）。
- **更新（SDK）**：`CLAUDE.md` rest.ts 描述补 `clearLogs`。

## 2026-08-17 — 增量更新（api-operations 工具组 + SDK rest.ts）

- **背景**：8-15 后落地（部分未提交）：新工具组 `src/tools/api-operations.ts`（`clear-process-logs`/`import-process-batch`/`select-directory`，仅 stdio 注册）、`src/native-directory.ts`（`pickDirectory` 从 `http-server.ts` 抽出）、SDK 新文件 `src/rest.ts`（REST 封装，`index.ts` re-export）；`room-logs` 工具与 `GET /api/rooms/:roomId/logs` 增加 `startTime`/`endTime`；CLI 新增 `import-batch`/`clear-process-logs`/`select-directory` 子命令。
- **更新（根）**：`public-interfaces`（工具数 11→14、+3 工具行、REST 补 `DELETE /api/processes/:id/logs`、`POST /api/processes/import-batch`、`POST /api/select-directory`、`DELETE /api/log-files`、`GET /api/log-files/content`、CLI 全命令）；`module-responsibilities`（工具层 8 文件 14 工具、+`native-directory`/`process-log-files` 行）；`conventions`/`file-map`（工具数 9/8→14/10、新文件补录）；`CLAUDE.md` 工具数与扫描状态同步。
- **补漏**：上轮遗漏的 `src/process-log-files.ts`（顶层）与 `src/tools/process-log-files.ts`（`process-log-files`/`log-files` 工具）本轮补记。
- **更新（SDK）**：`CLAUDE.md` 简介四块→五块能力；`module-responsibilities`/`public-interfaces`/`file-map` 补 `rest.ts`（8 文件）。
- **备注**：`api-changes.md` 当前在工作区被清空；其 8-15/8-17 历史 API 记录已并入根 `public-interfaces.md`。

## 2026-08-15 — 增量更新（room/trace/system 子域落地）+ 新建 SDK 索引

- **背景**：8-14 12:11 ~ 8-15 09:17 共 10 个提交落地了 room（`/room` WS + `room-hub/room-repository/room-logs`）、trace（`trace-store` + `tools/trace.ts` + SDK hook）、`system-processes`、`--data-path`、`batch-process`、`resolveSpawnTarget`（Windows `.cmd`/`.bat` spawn 修复，未提交工作区改动）等，上轮（8-14 09:11）文档未覆盖。
- **更新（根）**：`overview`/`module-responsibilities`/`public-interfaces`/`testing-and-quality`/`file-map` 重写（工具数 9/8、WS 双端点 `/ws`+`/room`、REST 补 rooms/system-processes/reveal、测试 10 套）；`entrypoints`/`conventions`/`dependencies-and-config`/`data-model`/`faq` 增量补齐（`--data-path`、`closeTraceStore`、新依赖、RoomRecord/TraceEnvelope、新 FAQ）。
- **新建**：`packages/procm-sdk/CLAUDE.md` + `claude/` 11 文件（SDK 源码 7 文件 100% 阅读；含 custom-execution eval 风险如实记录）。
- **同步**：根 `CLAUDE.md` 模块索引补 procm-sdk 行、Mermaid 图补 `/room` 与 SDK。

## 2026-08-14 — 移除已废弃的 allow-x 功能 + 全量重写

- **背景**：allow-x / `allowed-process` 白名单功能已从源码移除，但 `build/` 残留孤儿产物、文档仍把它当作核心。本轮据当前代码重写全部索引与详情。
- **删代码**：`build/tools/allowed-process.js`、`build/allowed-process-creations.js`、`build/logs-repository.js`（三者无 `src/` 对应、无任何 import）。
- **删文档概念**：移除 allow-x 白名单、`allowed-process` 工具、`--allow-all`/`PROCM_ALLOW_ALL`（代码中本就不存在）的全部描述。
- **重写**：根 `CLAUDE.md` + `claude/` 下 11 个详情文件全部据实重写（overview/conventions/module-responsibilities/entrypoints/public-interfaces/dependencies-and-config/data-model/testing-and-quality/file-map/faq）。如实记录：进程启动无门控；stdio 5 工具 / `/mcp` 4 工具（缺 `process-input`）；运行时数据落点无 allowlist 文件。
- **同步**：`README.md`（删 `allowed-process` 工具项与「Secure process creation」「Disabling the gate」章节，补 `process-input` 工具项）、`.codex/config.toml`（删 allowed-process 工具块）。

## 2026-08-01 — 增量更新（补全新增模块 + 修正 staleness）

- 全仓重扫，补 `events.ts`/`websocket-server.ts`/`processes-repository.ts`/`project-scanner.ts`；新增 REST 端点与 `/ws` 补入 public-interfaces；修正 `build:all` 不存在等脱节描述；dashboard 全量重写（改 WebSocket + vite proxy + Favorites）。
