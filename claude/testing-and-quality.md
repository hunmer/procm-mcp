# 测试与质量

## 命令

```bash
npm test                 # build + node tests/run-all.mjs（13 套串行，每套独立临时数据目录）
npm run test:lifecycle   # 单套（:logs / :http / :mcp / :cli / :trace 同理）
npm run test:custom-noise # 两个高噪音持久进程的 SDK custom-execution 端到端测试
npm run test:log-clear-notification  # 清日志 WS 通知（独立，需 7332 测试后端已运行：npm run test-procm）
node tests/ws-livecheck.mjs   # WebSocket 端到端（不在 run-all 内，手动跑）
```

run-all 会给每套测试设独立 `PROCM_MCP_DIR`（mkdtemp 临时目录）并在结束后清理，套间不共享数据。

## 自建框架（`tests/_helpers.mjs`）

- `startBackend`/`stopBackend`：在随机端口起一个 `--server` 后端；`randomPort` 避免冲突。
- HTTP / MCP-stdio 辅助 + 极简 assert（`runTest`/`summarize`）。
- MCP-stdio 测试**串行**发请求（一次一个等响应），并发会被 SDK 并行 dispatch 引发竞态。**永远不关 stdin**（关 stdin 触发 cleanup+exit），用 `SIGKILL` 收尾。

## 测试套件（`tests/run-all.mjs` 注册 13 套）

| 文件 | 覆盖 |
|---|---|
| `spawn-target.mjs` | Windows：`resolveSpawnTarget` 把 `pnpm` 直解为 `pnpm.exe` 绕过 cmd.exe；`shouldIgnoreStdin` 对 pnpm/npm run 为 true、node 为 false |
| `native-directory.mjs` | `pickDirectory` 为 async 不阻塞事件循环；win32 分支 `powershell.exe -STA` + TopMost owner 窗体 + trim 返回路径 |
| `lifecycle.mjs` | HTTP 路径：start→info→list→restart→stop；启动失败的清理 |
| `logs-grep.mjs` | stdout/stderr 捕获、tail、正则 grep（用 `example-process.js`） |
| `http-api.mjs` | dashboard 页托管、`/api/processes` 形状、404、token 鉴权 |
| `mcp-http.mjs` | `/mcp` initialize、`tools/list`（**13 个**，缺 `process-input` 为预期）、HTTP 工具调用、与 REST 共享状态 |
| `noisy-custom-execution.mjs` | 两个持续输出 stdout/stderr 噪音的 Node 进程，经 SDK custom-execution 调用并校验返回值和清理 |
| `cli-roundtrip.mjs` | `node build/index.js <cmd>` 客户端命令对已运行后端的往返 |
| `data-path.mjs` | `--data-path` / `PROCM_MCP_DIR` 数据目录选择与隔离 |
| `room-sdk.mjs` | SDK `ProcmClient` 经 `/room` 的订阅/发布/成员事件 + room REST |
| `sdk-hook.mjs` | `createHook` 拦截 + trace 存取往返（fixture `fixtures/hook-target.mjs`） |
| `trace-logger.mjs` | Logger marker 编码 + `room-logs` 还原 |
| `trace-memory.mjs` | trace:put 的 LRU/TTL/超限错误码 + `trace-get` 工具 |
| `ws-livecheck.mjs` | `/ws` 端到端（**独立**，不在 run-all） |
| `log-clear-notification.mjs` | SDK `clearLogs` 清空后 stdout/stderr 已清且 WS 收到 `logCleared`（**独立**，不在 run-all，需 7332 测试后端） |

另有 `_smoke-*.mjs`（envs 持久化、process-input、restart-stopped 的冒烟脚本，不在 run-all）与 `docker-compose.yml`（demo 用）。

## 覆盖与风险

- 纯函数（`validateScript`、`resolveSpawnTarget`、`project-scanner`、命令重建 `buildCommand`）无独立单测，靠集成测试间接覆盖（`spawn-target.mjs` 覆盖 win32 分支）。
- `/mcp` 工具集与 stdio 仅差 `process-input`（api-operations 组已补）；如未来对齐需同步改 `mcp-http.mjs` 断言。
- `processes.json`/`rooms.json` 无文件锁：多后端并发写同一文件可能互相覆盖（设计上跨 server 共享）。
- `debug.log` 已有大小上限（截断重写）；**进程 `.log` 仍无上限**，长跑进程会无限增长，需评估。
- trace 覆盖以 happy path + 错误码为主，LRU 逐出时序无确定性测试。
