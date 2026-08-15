# 索引变更记录（CLAUDE/claude 文档）

> 仅记录本索引体系的生成/更新，与产品 Changelog 分开。保留最近 5 条，倒序。

## 2026-08-15 — 初始生成

- **背景**：SDK 经 8-14~8-15 多轮迭代（hook/trace/custom-execution 落地）已成为三大能力支柱之一，但 `packages/procm-sdk` 一直无索引文档。本轮补齐。
- **范围**：`src/` 7 个源文件 100% 逐行阅读；`package.json`/`tsconfig.json`；`dist/` 仅抽查确认与 src 同构。
- **新建**：`packages/procm-sdk/CLAUDE.md`（轻量索引）+ `claude/` 11 个详情文件。
- **要点如实记录**：custom-execution 为 eval 远程求值（信任边界 = room 成员）；trace 为后端内存 LRU 非持久；包内零测试、由根 tests/ 4 套覆盖。
