# 对外接口

包唯一出口 `@procm-mcp/sdk`（`src/index.ts` re-export 一切）。以下为公共 API 摘要。

## createProcmClient / ProcmClient（client.ts）

```ts
createProcmClient(options?: ProcmClientOptions): ProcmClient
// options: url? roomId? processId? clientName? memberId? token?
//          metadata? reconnect?(默认 true) webSocketFactory?
```

| 成员 | 签名要点 |
|---|---|
| `subscribe(topic, handler, {prefix?})` | 返回退订函数；重连后自动重放订阅 |
| `publish(topic, payload, {retain?})` | 返回 messageId；**未连接时抛错** |
| `waitFor<T>(topic, {prefix?, filter?, timeout?, signal?})` | Promise<RoomMessage<T>>；命中 filter 即退订清理；超时 reject、abort 抛 AbortError |
| `onMember(handler)` | `(event: "joined"\|"left"\|"replaced", member)` |
| `onState(handler)` | 立即回放当前态；`"connecting"\|"open"\|"closed"` |
| `requestTraceStore` / `cancelTraceStore` | trace:put 挂起请求管理（主要供 trace.ts 内部用） |
| `close()` | 幂等释放；reject 全部挂起 trace 请求 |
| `connectionState` / `pendingTraceRequestCount` / `roomId` / `memberId` / `clientName` / `processId` | 只读属性 |

## createLogger / Logger（logger.ts）

`createLogger({client?, clientName?, memberId?, processId?, console?})` → `debug/info/warn/error(message, data?, {traceId}?)` 与 `log(level, ...)`。console + `$procm/log` 双写。

## createHook / hookProperty（hook.ts）

```ts
createHook(fn, {client?, name?, captureArgs?, captureResult?, ttlSeconds?,
                filterFrame?, onTraceCreated?, onStored?, onStoreError?})
  : HookedFunction   // .before(ctx => {...}) / .after(ctx => {...}) 链式；ctx 可 setArgs/skip/setResult
hookProperty(target, key, {captureGet?, captureSet?, ...CreateHookOptions}): () => void  // 幂等 restore
```

导出类型 `FunctionTrace`/`TraceFrame`。

## saveTrace（trace.ts）

`saveTrace(client, data: JsonValue, {id?, ttlSeconds?, timeout?, signal?}): Promise<string>`（resolve 为 traceId）。常量 `TRACE_MAX_BYTES=262_144`、`TRACE_MIN/MAX_TTL_SECONDS=1/604_800`、`TraceEnvelope`。

## exposeCustomExecution / executeCustom（custom-execution.ts）

```ts
exposeCustomExecution(client, {target?, context?}): () => void   // 仅 open 后可调
executeCustom<TResult>(client, target, fn, args?, {timeout?(默认5s), signal?}): Promise<TResult>
// 失败抛 CustomExecutionError（.name 保留远端错误名）
```

## protocol.ts 纯导出

`PROCM_PROTOCOL_VERSION`、`PROCM_LOG_TOPIC("$procm/log")`、`PROCM_LOG_MARKER("@@PROCM_LOG_V1@@")`；类型 `JsonValue/LogLevel/RoomMember/RoomMessage/StructuredLog/ClientFrame/ServerFrame`；函数 `matchesTopic/parseClientFrame/parseServerFrame/encodeStructuredLog/decodeStructuredLogLine/stripStructuredLogFrame`。

## 依赖的后端能力

- WS 端点 `/room`（procm-mcp `room-hub.ts` 实现 ServerFrame 侧）。
- `trace:put` → `trace:stored`/`error(code)`（错误码见 README：`TRACE_NOT_FOUND` 等）。
- `trace-get` MCP 工具读取（SDK 只写不读）。
