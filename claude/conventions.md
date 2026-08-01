# 开发约定

## 构建命令

```bash
npm run build              # 构建 dashboard 再 tsc 编译 src/ -> build/（一次性全建，见 package.json "build"）
npm run watch              # tsc -w 持续编译（仅后端）
npm run build:dashboard    # 仅构建 dashboard/ -> dashboard/dist
npm run dev:dashboard      # dashboard 的 vite dev server（前端热更新）
```

> 注意：根 `package.json` 的 `build` 脚本是 `npm run build:dashboard && tsc`——**先建前端再建后端**，没有独立的 `build:all`。改了 TypeScript 源码后必须 `npm run build`，因为运行入口是 `./build/index.js`。

## 测试命令

```bash
npm test                   # build + 跑全部 6 个测试套件（lifecycle/logs/http/mcp/allow-x/cli）
npm run test:lifecycle     # 仅生命周期
npm run test:logs          # 仅日志 grep
npm run test:http          # 仅 HTTP REST API
npm run test:mcp           # 仅 MCP-over-HTTP（/mcp）
npm run test:allow-x       # 仅 allow-x 白名单
npm run test:cli           # 仅 CLI 客户端往返
```

每个测试套件都会 **先 build 再起一个随机端口的 `--server` 后端**，测完拆掉。无外部测试框架，断言写在 `tests/_helpers.mjs` + 各 `*.mjs`。

## 运行 / 调试

```bash
npm run start:server                    # node ./build/index.js --server（默认 7331）
npm run inspect                         # 用 @modelcontextprotocol/inspector 检查
node ./build/index.js --server --port 8080
node ./build/index.js                   # stdio MCP 模式（供 MCP 客户端连接）
```

## 代码风格（从现有代码归纳）

- TypeScript **strict** 模式；目标 ES2022，模块 Node16，`moduleResolution: Node16`。
- ESM（`"type": "module"`）；**源码 import 必须带 `.js` 扩展名**（如 `./process-manager.js`），这是 Node16 ESM 的硬性要求，即便源文件是 `.ts`。
- 工具注册统一模式：`export function registerXxxTools(server: McpServer)`，内部 `server.tool(name, description, zodSchema, handler)`。每个 handler 用 `logToolStart/logToolEnd/logToolError` 包裹，返回 `textResult`/`notFoundResult`。
- 错误转字符串统一走 `toErrorMessage(error)`。
- 进程管理能力导出在 `process-manager.ts`，**MCP 工具层与 HTTP 层都调用它**——新增进程操作时优先扩展该模块，再在两处入口接线。

## 禁止 / 注意事项

- **不要**在 MCP 工具的 `start-process` 里跳过 allow-x 校验；只有 HTTP dashboard 的 `POST /api/processes` 与 CLI `start` 允许绕过（人类驱动）。
- **不要**让 stdout/stderr 无界累积：日志写入已走 `updateQueue` 串行化，新增日志通道时保持该模式。
- **不要**在 stdio MCP 模式下往 stdout 打印业务日志（stdout 是协议通道）；用 `serverLog()`（写文件）或 `console.error`（stderr）。
- Windows 下杀进程必须考虑 `cmd /c` 子树——用 `tree-kill`，不要只杀顶层 PID。
- `.gitignore` 已忽略 `build/`、`node_modules/`、`dashboard/dist/`、`dashboard/node_modules/`；不要提交这些产物。

## 设计规范（coss / dashboard）

dashboard 使用 coss 组件（基于 Base UI），文件 vendored 自 coss registry，放在 `dashboard/src/registry/default/ui/`。新增组件需一并拷贝其传递依赖（如 `lib/utils`、`scroll-area`、`spinner`）。详见 [dashboard CLAUDE.md](../dashboard/CLAUDE.md)。

## MCP 工具新增检查清单

1. 在 `src/tools/<area>.ts` 写 `registerXxxTools`。
2. `index.ts`（stdio）与 `mcp-http.ts`（HTTP）的 `registerAllTools` 里**都要**注册——两处共享同一组工具。
3. handler 用 `logToolStart/End/Error` 记录，返回 `textResult`。
4. 用 zod 定义入参 schema。
5. 更新 `README.md` 的 Tools 列表与本文档的 [public-interfaces.md](public-interfaces.md)。
