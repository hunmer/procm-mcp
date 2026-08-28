# dashboard 测试与质量

## 测试命令

**无。** dashboard 没有任何自动化测试（无 vitest/jest/playwright，无测试脚本）。`package.json` 的 scripts 只有 `dev`/`build`/`preview`。

## 类型检查

- `npm run build` 的 `tsc -b` 是唯一类型门禁：`strict` + `noUnusedLocals` + `noUnusedParameters` + `verbatimModuleSyntax` + `noFallthroughCasesInSwitch`。
- 改动后务必本地 `npm run build` 验证类型与构建。

## 质量风险

- **零自动化测试**：所有交互（启动/停止/重启/删除、日志切换与实时追加、收藏/分组改动、导入导出配方、Tab 切换、主题、WS 重连、Playground 发请求）全靠人工验证。回归风险高。
- **token 鉴权部分适配**：WS 从页面 URL `?token=` 取 token（可用），但 REST `lib/api.ts` 不自动注入（受 `PROCM_HTTP_TOKEN` 保护时 REST 会 401）。
- **WS 回调注册模式**：`onProcessesMessage`/`onLogMessage` 把回调存 ref 以避免重订阅，但若误用（每次 render 直接传新闭包覆盖）行为仍正确，只是要理解 ref 机制。
- **日志防竞态依赖 ref**：LogPanel 的 `reqId` 丢弃过期响应；WS 实时追加是独立路径，不受 reqId 约束。
- **无 lint/formatter**：风格靠人工 + tsc 把关。
- **vendored 组件无锁定版本**：`registry/default/ui/*` 手工拷贝，不随 coss 上游自动更新；上游修 bug 不会同步。
- **Playground catalog 需人肉同步**：`playground/catalog.ts` 镜像后端 `src/http-server.ts` 路由，后端加/改端点不会自动反映到目录。

## 建议下一步

1. 引入 vitest + React Testing Library 覆盖 `App`/`ProcessList`/`LogPanel`/`NewProcessDialog`。
2. 给 `lib/api.ts`、`lib/types.ts` 加契约/单元测试，防止与后端 `toPublicRecord` 漂移。
3. REST 客户端支持 token 注入（受保护后端可用 dashboard）。
4. 评估 WS 重连 + 未读计数的边界（断网恢复、并发进程日志洪流）；catalog 可考虑从后端路由表生成。
