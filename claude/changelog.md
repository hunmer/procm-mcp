# 索引变更记录（CLAUDE/claude 文档）

> 仅记录本索引体系的生成/更新，与产品 Changelog 分开。保留最近 5 条，倒序。

## 2026-07-31 — 初始生成

- **范围**：全仓清点 + 模块优先扫描。
- **根目录**：新建 `CLAUDE.md`（轻量索引）+ `claude/` 下 11 个详情文件（overview / conventions / module-responsibilities / entrypoints / public-interfaces / dependencies-and-config / data-model / testing-and-quality / file-map / faq / changelog）。
- **dashboard 模块**：新建 `dashboard/CLAUDE.md` + `dashboard/claude/` 下详情文件。
- **覆盖**：后端 `src/` 全部 21 个 `.ts` 文件 + `src/tools/` 6 个文件、`tests/` 6 套 + helpers、`scripts/`、配置文件（package/tsconfig/server.json/.mcp.json/.gitignore/publish.yml）、dashboard `src/` 关键文件均已读取。
- **识别模块数**：2（根后端、dashboard 前端）。
- **未扫描**：`dashboard/src/registry/default/ui/*`（vendored coss 组件，逐一详读价值低，已归纳其来源与用法）、`.agents/` `.codex/` `.zcode/` `.claude/`（agent 工具配置，非项目源码）、`build/` `node_modules/` `dashboard/dist/`（产物/依赖）。
- **缺口/建议下一步**：(1) 补单元测试覆盖 `validateScript`/白名单匹配等纯函数；(2) 评估日志轮转方案；(3) 统一 `.mcp.json` 示例的 `--secure` 与实现（见 FAQ Q4）。
