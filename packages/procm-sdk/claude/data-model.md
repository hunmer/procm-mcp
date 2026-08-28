# 数据模型

## wire 帧（protocol.ts，版本常量 = 1）

```
ClientFrame = hello | subscribe | unsubscribe | publish | trace:put | ping
ServerFrame = welcome | message(RoomMessage) | member | error | trace:stored | pong
```

关键字段：

- `hello`：`{roomId, memberId, clientName, processId?, metadata?}` — 握手身份。
- `subscribe`：`{subscriptionId, topic, prefix?}`；订阅由客户端生成 id，重连后重放。
- `publish`：`{messageId, topic, timestamp, payload, retain?}` — retain 消息留给后来者（ readiness 信号用）。
- `trace:put`：`{requestId, traceId, ttlSeconds?, payload}` → 应答 `trace:stored{requestId, traceId}` 或 `error{code, message, requestId?}`。
- `welcome`：`{roomId, member(自己), members[](全员)}`；`member` 事件 `{event: "joined"|"left"|"replaced", member}`（同 memberId 重连 → replaced）。

## 领域类型

| 类型 | 要点 |
|---|---|
| `RoomMember` | `memberId/connectionId/clientName/processId?/connectedAt/metadata?` |
| `RoomMessage<T>` | `messageId/memberId/topic/timestamp/payload:T/retain?` |
| `StructuredLog` | `timestamp/level/memberId/clientName/processId?/message/data?/traceId?` — console 行内嵌 base64url 编码 + `@@PROCM_LOG_V1@@` marker |
| `FunctionTrace` | `kind:"function"` `traceId/name/startedAt/durationMs/status` `status ∈ returned\|resolved\|threw\|rejected\|skipped` + `callChain: TraceFrame[]` + 可选 `args/result/error`（仅 captureArgs/captureResult 开启时） |
| `TraceFrame` | `index/functionName/file/line?/column?/async`（V8 位置，上限 100 帧） |
| `TraceEnvelope` | `version:1/traceId/createdAt/roomId/memberId/processId?/data` — 后端存储外壳 |

## 常量与限流

| 常量 | 值 |
|---|---|
| `TRACE_MAX_BYTES` | 262 144（单条 256 KiB，客户端与服务端双侧校验） |
| `TRACE_MIN_TTL_SECONDS` / `MAX` | 1 / 604 800（默认 86 400，由后端定） |
| 心跳 | 20s `ping`/`pong` |
| 重连退避 | `min(500ms × 2^n, 10s) × (0.8~1.2 jitter)` |

## 状态（client 内部）

`ConnectionState: "connecting"|"open"|"closed"`；open 仅在收到 welcome 后置位（订阅随后重放）。`close()` 置 `disposed`，之后不再重连。
