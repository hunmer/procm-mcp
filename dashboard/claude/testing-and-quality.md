# dashboard 测试与质量

## 测试命令

**无。** dashboard 没有任何自动化测试（无 vitest/jest/playwright，无测试脚本）。`package.json` 的 scripts 只有 `dev`/`build`/`preview`。

## 类型检查

- `npm run build` 的 `tsc -b` 是唯一类型门禁：`strict` + `noUnusedLocals` + `noUnusedParameters` + `verbatimModuleSyntax` + `noFallthroughCasesInSwitch`。
- 改动后务必本地 `npm run build` 验证类型与构建。

## 质量风险

- **零自动化测试**：所有交互（启动/停止/重启、日志切换、主题、轮询、折叠 rail）全靠人工验证。回归风险高。
- **dev 跨域未解决**：`vite.config.ts` 未配 `/api` proxy，纯 dev 模式 API 打到 5173 自身失败——只能 build 后由后端托管验证（见 conventions）。
- **token 鉴权未适配**：后端设 `PROCM_HTTP_TOKEN` 时 dashboard 401（见 public-interfaces）。
- **日志防竞态依赖 ref**：LogPanel 的 `reqId` 是对的，但若将来引入并发流式日志需重新评估。
- **无 lint/formatter**：风格靠人工 + tsc 把关。
- **vendored 组件无锁定版本**：`registry/default/ui/*` 手工拷贝，不随 coss 上游自动更新；上游修 bug 不会同步。

## 建议下一步

1. 引入 vitest + React Testing Library 覆盖 `App`/`ProcessList`/`LogPanel`/`NewProcessDialog`。
2. 给 `lib/api.ts`、`lib/types.ts` 加契约测试，防止与后端 `toPublicView` 漂移。
3. `vite.config.ts` 加 dev proxy 或文档化「build 后托管」流程。
4. 评估 dashboard 在 token 保护下的鉴权方案。
