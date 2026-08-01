# 测试与质量

## 测试命令

```bash
npm test                   # build + 全部 6 套
npm run test:lifecycle     # 生命周期：start/list/info/restart/delete
npm run test:logs          # 日志 grep
npm run test:http          # HTTP REST API
npm run test:mcp           # MCP-over-HTTP（/mcp）
npm run test:allow-x       # allow-x 白名单
npm run test:cli           # CLI 客户端往返
```

所有 `test:*` 脚本都 `npm run build` 在前——**必须先编译**才能跑（入口是 `build/index.js`）。

## 测试框架

**无外部测试框架**（不用 jest/vitest/mocha）。自建极简断言：

- `tests/_helpers.mjs` 提供 `assert(cond,msg)`、`assertEqual`、`runTest(name,fn)`、`summarize()`，以及后端生命周期管理 `startBackend({port, allowAll})` / `stopBackend` / `randomPort`。
- HTTP helper `http(port,method,path,body,token)`、MCP-stdio helper `mcpCalls(requests,{allowAll})`、MCP-HTTP helper `mcpHttp(port,id,method,params)` + `mcpHttpHandshake`。
- `tests/run-all.mjs` 串行跑 6 套，汇总 `Suites: X passed, Y failed`。

## 测试策略

- 每套起一个**随机端口**（`20000 + rand*10000`）的 `--server` 后端，等 `/api/processes` 200 就绪（最多 8s），测完 `SIGTERM` 拆。
- 用 `tests/example-process.js` 作为「长寿无操作子进程」替身。
- MCP-stdio 测试**串行**发请求（一次一个等响应），注释明确说明：并发请求会被 SDK 并行 dispatch，导致 `allowed-process`（action `allow`）后 `start-process` 竞态。**永远不关 stdin**（关 stdin 触发 cleanup+exit），用 `SIGKILL` 收尾。
- `tests/docker-compose.yml` + `nginx-test.conf` 提供可选的真实服务进程用于手工验证。

## 类型检查

- `tsconfig.json` 开 `strict: true`、`forceConsistentCasingInFileNames`、`skipLibCheck`。
- `npm run build`（`tsc`）即类型检查门禁；CI 跑 `npm run build`。

## 覆盖情况（已扫描）

| 能力 | 套件 | 状态 |
|---|---|---|
| 进程 start/list/info/restart/delete | `lifecycle.mjs` | ✅ |
| 日志 top / grep（stdout+stderr、ignoreCase、count） | `logs-grep.mjs` | ✅ |
| REST：列表/详情/启动/停/重启/logs/grep | `http-api.mjs` | ✅ |
| `/mcp` Streamable HTTP 工具调用 + handshake | `mcp-http.mjs` | ✅ |
| allow-x：放行后可启动、未放行被拒、delete 失效、allow-all 绕过 | `allow-x.mjs` | ✅ |
| CLI 客户端 ps/info/logs/grep/start/restart/stop/ping | `cli-roundtrip.mjs` | ✅ |

## 质量风险 / 已知弱点

- **无单元测试覆盖纯函数**（`validateScript`/`createCommand`/白名单匹配/`project-scanner` 的清单解析）——它们只通过端到端套件间接覆盖（`project-scanner` 完全无测试覆盖）。
- **无 lint / formatter 配置**（仓库未发现 eslint/prettier），代码风格靠人工保持。
- **日志文件无清理/轮转**：lowdb 全量 read/write 且每条都落盘，长期运行的高输出进程会让 JSON 文件膨胀。`top`/`search` 每次都读全文件进内存。
- **`--secure` flag**：`.mcp.json` 示例里用了 `--secure`，但 `index.ts` 的 `parseArgs` 不识别它（会静默忽略）。见 FAQ。
- **dashboard 无自动化测试**：React UI 仅靠人工验证，无组件/快照测试。
- **并发**：白名单文件无文件锁，多进程并发写同一 `allowed-process-creations.json` 可能互相覆盖（设计上跨 server 共享该文件）。
