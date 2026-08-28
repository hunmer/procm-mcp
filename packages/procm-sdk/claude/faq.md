# 常见问题与定位

**Q：构造 `ProcmClient` 直接抛 "procm roomId is required"？**
roomId 必需。托管进程会从 `PROCM_ROOM_ID` 自动读；独立进程需显式传 `options.roomId`（后端 REST `POST /api/processes`/MCP `start-process` 的 `roomId` 参数决定注入值）。

**Q：`connect()` 的错误没被 try/catch 捕获？**
构造后连接是 `queueMicrotask` 异步发起的，URL 缺失时错误发生在微任务里。用 `onState` 监听或手动调 `connect()` 包 try/catch。

**Q：publish 抛 "procm client is not connected"？**
publish 在未连接时**抛错**（防止静默丢消息）；subscribe/waitFor 则允许先注册、open 后重放。要么等 `connectionState === "open"`，要么用 `onState` 门控。

**Q：token 怎么传？**
`options.token` 或环境变量 `PROCM_HTTP_TOKEN`。SDK 会同时走 URL `?token=` 和子协议 `bearer.<token>`（后端 `websocket-server.ts` 两者都认）。

**Q：`executeCustom` 安全吗？**
不。目标端用 `eval` 求值发来的函数源码——room 内任何成员都能让暴露端执行任意代码。只在完全信任的本地 room 使用；不信任的 room 不要 `exposeCustomExecution`。

**Q：trace 存在哪里？重启还在吗？**
后端 procm-mcp 实例的**内存** LRU（总量 64 MiB、单条 256 KiB、默认 TTL 24h）。重启即清、LRU 可能提前逐出、跨实例不共享。读取用 `trace-get` MCP 工具。

**Q：`saveTrace` 与 `TRACE_STORE_CONFLICT`？**
不传 `id` 时冲突自动换新 id 重试（最多 3 次）；显式传 `id` 冲突立刻抛——幂等写入语义由调用方选择。

**Q：hook 的 before/after 里能异步吗？**
不能。返回 thenable 会抛 "must be synchronous"——保证 trace 的 args/result 在原函数执行前后语义确定。异步副作用放到函数内部或 `onStored` 回调。

**Q：console 输出里那串 `@@PROCM_LOG_V1@@...` 是什么？**
结构化日志的 base64url 编码载体（`protocol.ts` `encodeStructuredLog`）。后端 `room-logs.ts` 靠它从进程 stdout 还原结构化条目；`stripStructuredLogFrame` 可剥掉它取人读文本。

**Q：改了 SDK 源码，后端/测试没反映？**
必须先 `npm run build:sdk`（根 `npm run build` 会自动先做）。workspace 依赖消费的是 `dist/`，不是 `src/`。
