# 测试与质量

## 命令

```bash
npm test                 # build + node tests/run-all.mjs（10 套串行，每套独立临时数据目录）
npm run test:lifecycle   # 单套（:logs / :http / :mcp / :cli / :trace 同理）
node tests/ws-livecheck.mjs   # WebSocket 端到端（不在 run-all 内，手动跑）
```

run-all 会给每套测试设独立 `PROCM_MCP_DIR`（mkdtemp 临时目录）并在结束后清理，套间不共享数据。

## 自建框架（`tests/_helpers.mjs`）

- `startBackend`/`stopBackend`：在随机端口起一个 `--server` 后端；`randomPort` 避免冲突。
- HTTP / MCP-stdio 辅助 + 极简 assert（`runTest`/`summarize`）。
- MCP-stdio 测试**串行**发请求（一次一个等响应），并发会被 SDK 并行 dispatch 引发竞态。**永远不关 stdin**（关 stdin 触发 cleanup+exit），用 `SIGKILL` 收尾。

## 测试套件（`tests/run-all.mjs` 注册 10 套）

| 文件 | 覆盖 |
|---|---|
| `lifecycle.mjs` | HTTP 路径：start→info→list→restart→stop；启动失败的清理 |
| `logs-grep.mjs` | stdout/stderr 捕获、tail、正则 grep（用 `example-process.js`） |
| `http-api.mjs` | dashboard 页托管、`/api/processes` 形状、404、token 鉴权 |
| `mcp-http.mjs` | `/mcp` initialize、`tools/list`（**8 个**，缺 `process-input` 为预期）、HTTP 工具调用、与 REST 共享状态 |
| `cli-roundtrip.mjs` | `node build/index.js <cmd>` 客户端命令对已运行后端的往返 |
| `data-path.mjs` | `--data-path` / `PROCM_MCP_DIR` 数据目录选择与隔离 |
| `room-sdk.mjs` | SDK `ProcmClient` 经 `/room` 的订阅/发布/成员事件 + room REST |
| `sdk-hook.mjs` | `createHook` 拦截 + trace 存取往返（fixture `fixtures/hook-target.mjs`） |
| `trace-logger.mjs` | Logger marker 编码 + `room-logs` 还原 |
| `trace-memory.mjs` | trace:put 的 LRU/TTL/超限错误码 + `trace-get` 工具 |
| `ws-livecheck.mjs` | `/ws` 端到端（**独立**，不在 run-all） |

另有 `_smoke-*.mjs`（envs 持久化、process-input、restart-stopped 的冒烟脚本，不在 run-all）与 `docker-compose.yml`（demo 用）。

## 覆盖与风险

- 纯函数（`validateScript`、`resolveSpawnTarget`、`project-scanner`、命令重建 `buildCommand`）无独立单测，靠集成测试间接覆盖。
- `/mcp` 工具集与 stdio 不一致（少 `process-input`）——`mcp-http.mjs` 断言为 8，符合现状；如未来对齐需同步改测试。
- `processes.json`/`rooms.json` 无文件锁：多后端并发写同一文件可能互相覆盖（设计上跨 server 共享）。
- 日志无轮转：长跑进程 `.log` 会无限增长，需评估上限。
- trace 覆盖以 happy path + 错误码为主，LRU 逐出时序无确定性测试。
