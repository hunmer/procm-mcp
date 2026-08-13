# 测试与质量

## 命令

```bash
npm test                 # build + node tests/run-all.mjs（5 套串行）
npm run test:lifecycle   # 单套（:logs / :http / :mcp / :cli 同理）
node tests/ws-livecheck.mjs   # WebSocket 端到端（不在 run-all 内，手动跑）
```

## 自建框架（`tests/_helpers.mjs`）

- `startBackend`/`stopBackend`：在随机端口起一个 `--server` 后端；`randomPort` 避免冲突。
- HTTP / MCP-stdio 辅助 + 极简 assert（`runTest`/`summarize`）。
- MCP-stdio 测试**串行**发请求（一次一个等响应），并发会被 SDK 并行 dispatch 引发竞态。**永远不关 stdin**（关 stdin 触发 cleanup+exit），用 `SIGKILL` 收尾。

## 测试套件（`tests/`）

| 文件 | 覆盖 |
|---|---|
| `lifecycle.mjs` | HTTP 路径：start→info→list→restart→stop；启动失败的清理 |
| `logs-grep.mjs` | stdout/stderr 捕获、tail、正则 grep（用 `example-process.js`） |
| `http-api.mjs` | dashboard 页托管、`/api/processes` 形状、404、token 鉴权 |
| `mcp-http.mjs` | `/mcp` initialize、`tools/list` 返回 **4 个**工具、HTTP 工具调用、与 REST 共享状态 |
| `cli-roundtrip.mjs` | `node build/index.js <cmd>` 客户端命令对已运行后端的往返 |
| `ws-livecheck.mjs` | `/ws` 端到端：连上、起进程、断言收到 `processes` 与 `log` 消息（独立，不在 run-all） |

## 覆盖与风险

- 纯函数（`validateScript`、`project-scanner`、命令重建 `buildCommand`）无独立单测，靠集成测试间接覆盖。
- `/mcp` 工具集与 stdio 不一致（少 `process-input`）——`mcp-http.mjs` 断言为 4，符合现状；如未来对齐需同步改测试。
- `processes.json` 无文件锁：多后端并发写同一文件可能互相覆盖（设计上跨 server 共享）。
- 日志无轮转：长跑进程 `.log` 会无限增长，需评估上限。
