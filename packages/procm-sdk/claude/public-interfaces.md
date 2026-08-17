# 对外接口

包唯一出口 `@hunmer/procm-mcp-sdk`（`src/index.ts` re-export 一切）。以下为公共 API 摘要。

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

`createLogger({client?, clientName?, memberId?, processId?, console?, level?})` → `debug/info/warn/error(message, data?, {traceId}?)` 与 `log(level, ...)`。console + `$procm/log` 双写；`level`（默认 `"debug"`，可 `"silent"`）为输出下限，可用 `setLevel()` 运行时调整。

消费侧过滤：`matchesLogFilter(entry, {minLevel?, clientNames?, memberIds?})` 谓词，及 `subscribeLogs(client, handler, filter?)`（订阅 `$procm/log`，仅转发通过过滤且 payload 合法的条目，返回退订函数；空数组 = 不限制）。类型 `LogFilter`。

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

## rest.ts 后端 REST 封装

```ts
clearProcessLogs(client, id): Promise<{id, cleared: true}>        // DELETE /api/processes/:id/logs
importProcessBatch(client, items: ImportProcessItem[], group?): Promise<{imported: {id,name,favorite}[]}>
batchImportProcesses   // = importProcessBatch 别名
selectDirectory(client, title?): Promise<string | null>          // POST /api/select-directory，取消 → null
// ImportProcessItem: {script, args, cwd, name?, desc?}
```

不建立新连接：从 `client.connectionTarget` 取 url（`ws://`→`http://`、去 `/room` 尾缀）与 token（Bearer）。非 2xx 抛 `Error(payload.error || "HTTP <status>")`；`items` 为空数组直接抛错。

## protocol.ts 纯导出

`PROCM_PROTOCOL_VERSION`、`PROCM_LOG_TOPIC("$procm/log")`、`PROCM_LOG_MARKER("@@PROCM_LOG_V1@@")`；类型 `JsonValue/LogLevel/RoomMember/RoomMessage/StructuredLog/ClientFrame/ServerFrame`；函数 `matchesTopic/parseClientFrame/parseServerFrame/encodeStructuredLog/decodeStructuredLogLine/stripStructuredLogFrame`。

`collectLogs(client, {startTime?, endTime?, count?, minLevel?, clientNames?, memberIds?})`：通过客户端对应的 HTTP 服务读取 room 已持久化的结构化日志，并按 Unix 毫秒时间窗口（包含边界）筛选；适合在 UI 测试执行前后记录时间戳后回收测试期间日志。

## 依赖的后端能力

- WS 端点 `/room`（procm-mcp `room-hub.ts` 实现 ServerFrame 侧）。
- `trace:put` → `trace:stored`/`error(code)`（错误码见 README：`TRACE_NOT_FOUND` 等）。
- `trace-get` MCP 工具读取（SDK 只写不读）。
