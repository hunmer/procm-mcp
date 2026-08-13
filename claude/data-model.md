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
- 每条 `ProcessRecord` 记录某次启动的不可变档案（id/script/args/cwd/envs/name/状态/退出码/startedAt/stoppedAt 等）。
- `listProcessRecords()` 合并「内存活进程」+「磁盘历史」；停止/退出的进程仍可查日志（读磁盘 `.log`）。
- `reconcileStaleProcesses()`：启动时把上次崩溃残留的 `running` 记录回收（kill 孤儿 PID 并标记 exited）。
- **无文件锁**：多进程并发写同一文件可能互相覆盖。

## 日志（`process-stdout-client.ts`）

- 每流双写：2000 行内存环形缓冲（供 `top`/tail）+ 磁盘 `<serverId>/processes/<id>-{stdout,stderr}.log`（行分隔纯文本，append-only）。
- `top(n)` 取最近 n 行；`search(pattern, after)` 正则 grep，`after` 为匹配后的上下文行数。
- 停止的进程无内存缓冲时，仍从磁盘 `.log` 读取。
- 历史目录里可能残留旧版 `.json` 日志（旧版双写 `.json`+.log），当前源只写 `.log`。

## WS 消息

```
{ type:"processes", serverId?, pid?, startedAt?, data: ProcessView[], snapshot? }
{ type:"log", processId, stream, timestamp, message }
```

`ProcessView`（`http-server.ts` 的 `toPublicView`/`toPublicRecord`）是给 dashboard 的精简公开视图（含 `startedAt?`/`stopped?`）。dashboard `lib/types.ts` 镜像之，字段变动需同步。
