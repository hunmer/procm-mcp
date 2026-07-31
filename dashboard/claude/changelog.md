# dashboard 索引变更记录

> 仅记录本索引体系的生成/更新，保留最近 5 条，倒序。

## 2026-07-31 — 初始生成

- **范围**：dashboard 工程全量扫描。
- **新建**：`dashboard/CLAUDE.md`（轻量索引）+ `dashboard/claude/` 下 9 个详情文件（overview / conventions / module-responsibilities / entrypoints / public-interfaces / dependencies-and-config / data-model / testing-and-quality / file-map / faq / changelog）。
- **覆盖**：`src/main.tsx`、`src/index.css`、`src/components/*.tsx`（6 个）、`src/lib/*.ts`（3 个）、`src/registry/default/lib/utils.ts`、`index.html`、`package.json`、`tsconfig.json`、`vite.config.ts`、`README.md`。
- **未详读**：`src/registry/default/ui/*.tsx`（11 个 vendored coss 组件，已归纳来源与用法，未逐一展开源码）；`node_modules/`、`dist/`、`tsconfig.tsbuildinfo`。
- **缺口/建议下一步**：(1) 引入 vitest + RTL 测试；(2) 修复 dev 跨域（加 vite proxy）；(3) 适配 token 鉴权；(4) 给后端 `ProcessView` 加契约同步测试。
