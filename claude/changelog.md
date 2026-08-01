# 索引变更记录（CLAUDE/claude 文档）

> 仅记录本索引体系的生成/更新，与产品 Changelog 分开。保留最近 5 条，倒序。

## 2026-08-01 — 增量更新（补全新增模块 + 修正 staleness）

- **范围**：全仓重扫，重点补前次（2026-07-31）遗漏的新增代码与更正脱节描述。
- **根后端新增/补全**：
  - `events.ts`（进程内事件总线，burst 合并）、`websocket-server.ts`（`/ws` 实时推送）、`processes-repository.ts`（进程历史持久化 `processes.json`，`ProcessRecord`/`listProcessRecords`/`deleteProcesses`/`removeMany`）、`project-scanner.ts`（项目清单扫描 → favorites 候选）—— 前次均漏，本次补入 module-responsibilities / data-model / file-map。
  - 新增 REST 端点补入 public-interfaces：`/api/meta`、`/api/favorites/scan`、`/api/open-folder`、`/api/processes/:id/{log-files,log-download,command}`、`DELETE /api/processes`（批量）、WebSocket `/ws`。
  - `process-stdout-client` 改三路分发（实时 emit + 双写）；`data-model` 补 `ProcessRecord`、持久化历史、启动回收 `reconcileStaleProcesses`。
  - 修正：`conventions.md` 的 `npm run build:all` 不存在（根 `build` = `build:dashboard && tsc`）；`dependencies` 补 `ws` 依赖、inspector 版本 `^0.16.1 → ^1.0.1`、`@types/ws`。
  - `entrypoints` 补两模式都跑 `reconcileStaleProcesses`；`testing` 补 `project-scanner` 无测试；FAQ 补 Q11（WS 实时）/Q12（历史持久化）。
  - 根 `CLAUDE.md`：技术栈加 `ws`、约定加实时推送/`build` 说明、Mermaid 加 events+WS 推送链路、扫描状态刷新。
- **dashboard 全量重写**：前次基于旧「3s 轮询 + 无 vite proxy」UI，严重脱节。本次据实重写全部 11 个详情文件——实时改 WebSocket、proxy 已配、新增 Favorites 子域（favorites/presets/cwd）、双 Tab、未读徽标、批量、grep/下载/复制命令等。详见 dashboard/claude/changelog.md。
- **覆盖**：后端 25 文件 + dashboard 8 组件/7 lib + 测试/脚本/配置，全部读取核对。
- **下一步建议**：补 `project-scanner`/纯函数单测；日志轮转；`.mcp.json` `--secure` 一致性；dashboard REST token 注入。

## 2026-07-31 — 初始生成

- **范围**：全仓清点 + 模块优先扫描。
- **根目录**：新建 `CLAUDE.md`（轻量索引）+ `claude/` 下 11 个详情文件。
- **dashboard 模块**：新建 `dashboard/CLAUDE.md` + `dashboard/claude/` 下详情文件。
- **注意**：此版遗漏 `events.ts`/`websocket-server.ts`/`processes-repository.ts`/`project-scanner.ts`，dashboard 部分基于旧轮询架构；已于 2026-08-01 修正。
