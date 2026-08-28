# 数据模型

## 核心类型（`types.ts`）

```ts
type ProcessStatus = "spawning" | "running" | "exited" | "error";
interface ProcessMetadata {
  id; pid; name; script; args: string[]; cwd;
  status: ProcessStatus; exitCode?: number; error?: string;
  desc?: string | null;
  // ...进程运行期内存态
}
```

## 状态机

```
spawn → spawning → running ──(自然退出)──▶ exited (exitCode)
                 running ──(spawn/错误)──▶ error (error 信息)
restart: 先 kill 再以相同 script/args/cwd/envs 重 spawn
delete/stop: kill（SIGTERM，10s 未退则 SIGKILL）+ 移除内存 + 持久化
```

## 持久化历史（`ProcessRecord` / `processes-repository.ts`）

- 落盘 `<tmpdir>/procm-mcp/processes.json`，结构 `{ processes: ProcessRecord[] }`，全局跨 server 共享。
- 每条 `ProcessRecord` 记录某次启动的档案（id/script/args/cwd/envs/name/状态/退出码/startedAt/stoppedAt/group?/favorite/port 等）；`updateProcessFields` 可按需合并修改 name/script/args/cwd/desc/port/envs/group（`PATCH /api/processes/:id`），favorite 经 `setProcessFavorite` 切换。
- 数据根另有 `settings.json`（`{debugLogMaxBytes?: number}`，`logger.ts` 只读一次缓存）。
- `listProcessRecords()` 合并「内存活进程」+「磁盘历史」；停止/退出的进程仍可查日志（读磁盘 `.log`）。
- `reconcileStaleProcesses()`：启动时把上次崩溃残留的 `running` 记录回收（kill 孤儿 PID 并标记 exited）。
- **无文件锁**：多进程并发写同一文件可能互相覆盖。

## 日志（`process-stdout-client.ts`）

- 每流双写：2000 行内存环形缓冲（供 `top`/tail）+ 磁盘 `<serverId>/processes/<id>-{stdout,stderr}.log`（行分隔纯文本，append-only）。
- `top(n)` 取最近 n 行；`search(pattern, after)` 正则 grep，`after` 为匹配后的上下文行数。
- 停止的进程无内存缓冲时，仍从磁盘 `.log` 读取。
- 历史目录里可能残留旧版 `.json` 日志（旧版双写 `.json`+.log），当前源只写 `.log`。

## 房间（room 子域）

- `RoomRecord`（`room-repository.ts`，落盘 `<数据目录>/rooms.json`）：`{id, title, note, processIds[], createdAt, updatedAt}`——进程重启后凭 `roomId` 重新挂回房间。
- 活跃成员 = `/room` WS 连接的 `RoomMember`（memberId/clientName/processId/metadata），协议帧（hello/welcome/subscribe/publish/member/…）定义在 `packages/procm-sdk/src/protocol.ts`，版本常量 1。
- 结构化日志：SDK `Logger` 在进程 stdout 打「可读前缀 + `@@PROCM_LOG_V1@@` + base64url(JSON)」；`room-logs.ts` 读各进程 `.log` 用 `decodeStructuredLogLine` 还原为 `RoomLogEntry`（timestamp/level/memberId/message/data?/traceId?）。

## 追踪（trace 子域）

- `StoredTraceEnvelope`（`trace-store.ts`）：`{version:1, traceId, createdAt, roomId, memberId, processId?, data}`；`data` 常为 SDK 的 `FunctionTrace`（name/durationMs/status/callChain/args?/result?/error?）。
- 存储约束：LRU 总量 64 MiB、单条 256 KiB、TTL 1~604800s（默认 `PROCM_TRACE_TTL_SECONDS` 或 86400）；错误码稳定（`TRACE_NOT_FOUND`/`TRACE_INVALID_ID`/`TRACE_INVALID_PAYLOAD`/`TRACE_STORE_CONFLICT`/`TRACE_STORE_ERROR`/`TRACE_REQUEST_TIMEOUT`）。

## WS 消息

```
{ type:"processes", serverId?, pid?, port?, startedAt?, data: ProcessView[], snapshot? }
{ type:"log", processId, stream, timestamp, message }
{ type:"logCleared", processId }
```

`ProcessView`（`http-server.ts` 的 `toPublicView`/`toPublicRecord`）是给 dashboard 的精简公开视图（含 `startedAt?`/`stopped?`/`group?`/`favorite`/`port`）；`port`（进程记录的端口元数据）与 WS `processes` 消息顶层的 `port`（后端 HTTP 监听端口）是两个字段。dashboard `lib/types.ts` 镜像之，字段变动需同步。
