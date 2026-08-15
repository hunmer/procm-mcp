# 索引变更记录（CLAUDE/claude 文档）

> 仅记录本索引体系的生成/更新，与产品 Changelog 分开。保留最近 5 条，倒序。

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

## 2026-07-31 — 初始生成

- 全仓清点 + 模块优先扫描；新建根 `CLAUDE.md` + `claude/` 11 文件、`dashboard/CLAUDE.md` + `dashboard/claude/` 详情。
