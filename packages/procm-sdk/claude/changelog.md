# 索引变更记录（CLAUDE/claude 文档）

> 仅记录本索引体系的生成/更新，与产品 Changelog 分开。保留最近 5 条，倒序。

## 2026-08-17 — 增量更新（新增 rest.ts）

- **背景**：新增 `src/rest.ts`（后端 REST 封装：`clearProcessLogs`/`importProcessBatch`/`selectDirectory`，经 `index.ts` re-export），对应根仓 8-15/8-17 落地的三个 REST 端点。
- **更新**：`CLAUDE.md`（简介四块→五块能力、扫描状态）、`module-responsibilities`（7→8 文件 + rest.ts 行）、`public-interfaces`（+rest.ts 段）、`file-map`（+rest.ts）。
- **要点**：rest.ts 复用 `ProcmClient` 连接配置（ws→http 换算），不新建连接；`dist/` 已同步编译（rest.js/.d.ts 在工作区）。

## 2026-08-15 — 初始生成

- **背景**：SDK 经 8-14~8-15 多轮迭代（hook/trace/custom-execution 落地）已成为三大能力支柱之一，但 `packages/procm-sdk` 一直无索引文档。本轮补齐。
- **范围**：`src/` 7 个源文件 100% 逐行阅读；`package.json`/`tsconfig.json`；`dist/` 仅抽查确认与 src 同构。
- **新建**：`packages/procm-sdk/CLAUDE.md`（轻量索引）+ `claude/` 11 个详情文件。
- **要点如实记录**：custom-execution 为 eval 远程求值（信任边界 = room 成员）；trace 为后端内存 LRU 非持久；包内零测试、由根 tests/ 4 套覆盖。
