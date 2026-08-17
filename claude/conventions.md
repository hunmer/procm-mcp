# 开发约定

## 命令

```bash
npm run build              # = build:sdk → sync:demos → build:dashboard → tsc；入口 build/index.js
npm run build:sdk          # 仅编 packages/procm-sdk（改 SDK 后必须，后端消费 dist）
npm run build:dashboard    # 仅构建 dashboard（dashboard/ -> dashboard/dist）
npm run dev:dashboard      # dashboard dev server（proxy 到 PROCM_DEV_BACKEND/后端端口）
npm run watch              # tsc -w
npm test                   # build + 跑 11 套测试（run-all）
npm run test:lifecycle     # 单套（logs/http/mcp/cli/trace 同理）
npm run start:server       # node ./build/index.js --server
npm run link               # 全局 link 本地 checkout（npm link）
```

## 代码风格 / 约定

- ESM / Node16：源码 import **必须带 `.js` 后缀**（即使源是 `.ts`）。`verbatimModuleSyntax` 开启。
- 改 TS 后**必须 `npm run build`** 才能跑 `build/index.js`。
- **新增 MCP 工具要在两处都注册**：`index.ts`（stdio）与 `mcp-http.ts` 的 `registerAllTools`（HTTP `/mcp`）。当前两者工具集不一致：stdio 14 个、`/mcp` 10 个（缺 `process-input` 与 api-operations 组三件 `clear-process-logs`/`import-process-batch`/`select-directory`），新增时若希望两条路径一致就两边都加。
- 进程领域统一在 `src/process-manager.ts`；MCP 工具层（`src/tools/*`）与 HTTP 层（`http-server.ts`）都调它，不要各自实现。
- 任何进程状态/日志变更都要触发 `dashboardEvents.emitProcessChange()` / `emitLog()`，否则 dashboard WS 不会刷新。
- stdio MCP 模式下**不要往 stdout 打业务日志**（stdout 是协议通道）；用 `serverLog()`（写 `debug.log`）或 `console.error`（stderr）。
- 错误规约：用 `toErrorMessage(error)`（`error.ts`）做错误→字符串归一；工具返回统一走 `textResult` / `notFoundResult`（`tool-helpers.ts`）。

## 禁止事项

- 不要往 stdout 打业务日志（stdio 模式）。
- 不要绕过 `process-manager` 直接 `spawn` 子进程。
- 不要假设 `processes.json` 有文件锁——多进程并发写同一文件可能互相覆盖（设计上跨 server 共享）。

## 新增工具检查清单

1. 在 `src/tools/<name>.ts` 写 `register<Name>Tools(server)`。
2. `index.ts` 调用它（stdio）；如需 `/mcp` 也能用，在 `mcp-http.ts` 的 `registerAllTools` 也调用。
3. 需要时在 `http-server.ts` 加对应 REST 路由。
4. 状态/日志变更触发 `dashboardEvents.emit*`。
5. 返回走 `textResult` / `notFoundResult`，错误走 `toErrorMessage` + `logToolError`。
