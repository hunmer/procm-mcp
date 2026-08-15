# 模块职责

`src/` 7 个文件，`index.ts` 全量 re-export，其余按依赖分层：protocol（纯类型/编解码）← client ← logger/trace/custom-execution/hook。

| 文件 | 职责 |
|---|---|
| `protocol.ts` | **wire 协议 v1**（无依赖纯模块）。`ClientFrame`（hello/subscribe/unsubscribe/publish/trace:put/ping）与 `ServerFrame`（welcome/message/member/error/trace:stored/pong）联合类型 + `parseClientFrame`/`parseServerFrame` 严格校验；`RoomMember`/`RoomMessage`/`StructuredLog`/`LogLevel`/`JsonValue`；`matchesTopic`（精确/prefix）；`encodeStructuredLog`/`decodeStructuredLogLine`/`stripStructuredLogFrame`（base64url + `@@PROCM_LOG_V1@@` marker）。 |
| `client.ts` ★ | **`ProcmClient`** 房间客户端。构造时从 options/环境变量解析 roomId/processId/clientName/memberId；`queueMicrotask` 异步连接。hello 握手后 20s 心跳；断线指数退避重连（0.5s~10s + jitter，`reconnect:false` 关闭）。`subscribe`（返回退订函数，重连后自动重发订阅）/`publish`（retain）/`waitFor`（timeout/AbortSignal/filter，完成即退订）/`onMember`/`onState`/`close`。token 双通道注入：URL `?token=` + 子协议 `bearer.<token>`。`requestTraceStore`/`cancelTraceStore` 管理 `trace:put` 挂起请求，断连统一 reject。未连接时 `publish` 抛错、其余帧静默丢弃。 |
| `logger.ts` | **结构化日志**。`createLogger({client?, console?})` → `debug/info/warn/error/log`；每条先写 console（可读前缀 + marker 后缀），连接 open 时再 publish 到 `$procm/log`（失败仅吞掉，console 仍是可靠底线）。无 client 时 memberId/clientName 退化为 `standalone`/`app`。支持 `traceId` 关联。 |
| `custom-execution.ts` | **远程函数执行 RPC**。`exposeCustomExecution(client, {target?, context?})`：订阅 `$procm/custom-execution/request/<target>`，收到请求后 `eval` 函数源码、注入 context 执行、结果回发 replyTopic（异常转 `{ok:false,error}`）；返回退订函数。`executeCustom(client, target, fn, args?, {timeout?, signal?})`：`fn.toString()` 作为源码发送，`waitFor` 匿名 replyTopic（默认 5s 超时），失败抛 `CustomExecutionError`（保留远端错误名）。仅连接 open 后可用。 |
| `trace.ts` | **`saveTrace(client, data, {id?, ttlSeconds?, timeout?, signal?})`**。前置校验：必须 open、TTL 整数 1~604800、数据 JSON 可序列化且 ≤256 KiB；`trace:put` 请求默认 10s 超时、支持 abort；未指定 `id` 时遇 `TRACE_STORE_CONFLICT` 自动换 id 重试至 3 次，指定 id 冲突即抛。导出常量 `TRACE_MAX_BYTES`/`TRACE_MIN_TTL_SECONDS`/`TRACE_MAX_TTL_SECONDS` 与 `TraceEnvelope`。 |
| `hook.ts` | **函数拦截追踪**。`createHook(fn, options)` 返回 `HookedFunction`（`.before()/.after()` 链式、`.original`）：每次调用生成 traceId、`callsites()` 捕获调用链（过滤自身帧、上限 100、可 `filterFrame`）、before 可 `setArgs`/`skip`、after 可 `setResult`（两者必须同步）；保留 `this`/返回值类型/Promise 语义/原始异常；状态 `returned/resolved/threw/rejected/skipped`；`captureArgs/captureResult`（不可序列化时占位 `{unavailable}`）；有 client 时自动 `saveTrace`（`onStored`/`onStoreError` 回调，不写 console）。`hookProperty(target, key, options)`：拦截 own configurable 属性的 get/set（`captureGet/captureSet` 可关），返回幂等 restore 函数。 |
| `index.ts` | 全量 re-export 六个模块，包唯一出口。 |
