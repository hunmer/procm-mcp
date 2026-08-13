# dashboard 对外接口

dashboard 自身是后端 `GET /` 托管的静态页面，**不对外暴露接口**。它消费后端的同源 REST API 与 WebSocket `/ws`（完整定义见根 [claude/public-interfaces.md](../claude/public-interfaces.md)）。此处只列 dashboard 实际用到的调用。

## WebSocket（`src/lib/ws.ts` `useDashboardSocket`）

同源 `/ws`，自动重连（指数退避，cap 10s）。token 若在页面 URL `?token=` 则拼进 ws URL。

| 消息类型 | 字段 | 用途 |
|---|---|---|
| `processes`（含 `snapshot:true`） | `serverId, pid, startedAt, data: ProcessView[]` | 连接即发快照，之后进程变更推送。App 替换进程列表 + 算 uptime + 处理 pendingSelect |
| `log` | `processId, stream, timestamp, message` | 每条新日志。匹配打开的 LogPanel 则转发，否则 +未读 |

## REST（`src/lib/api.ts`）

| 函数 | 请求 | 用途 |
|---|---|---|
| `listProcesses()` | `GET /api/processes` | 列表（WS 之外的历史兜底，当前 App 主用 WS） |
| `getProcess(id)` | `GET /api/processes/:id` | 单进程详情 |
| `getLogs(id, stream, count=200)` | `GET /api/processes/:id/logs?stream=&count=` | 单流日志（LogPanel） |
| `grepLogs(id, stream, grep, ignoreCase, count=500)` | `GET /api/processes/:id/logs?...&grep=&ignoreCase=` | 正则搜索单流 |
| `getMergedLogs(id, count=200)` | 并行 getLogs stdout+stderr + `mergeEntries` | 合并双流历史日志 |
| `grepMergedLogs(id, grep, ignoreCase, count=500)` | 并行 grepLogs 双流 | 合并搜索 |
| `getLogFiles(id)` | `GET /api/processes/:id/log-files` | `{stdoutPath, stderrPath}`（复制文件位置） |
| `downloadLogUrl(id)` | `GET /api/processes/:id/log-download`（返回 URL，`<a download>` 用） | 下载合并日志 |
| `getProcessCommand(id)` | `GET /api/processes/:id/command` | 复现命令（复制到剪贴板） |
| `startProcess(body)` | `POST /api/processes` | NewProcessDialog / Favorites launch 启动（直接执行） |
| `stopProcess(id)` | `POST /api/processes/:id/stop` | ProcessList 停止并删除 |
| `restartProcess(id)` | `POST /api/processes/:id/restart` | ProcessList 重启 |
| `deleteProcessCall(id)` | `DELETE /api/processes/:id` | 删除单进程记录 |
| `clearAllProcesses(ids?)` | `DELETE /api/processes` body `{ids?}` | 批量删除（App 的 Clear all） |
| `scanDirectory(path)` | `POST /api/favorites/scan` body `{path}` | 扫描项目清单 → favorites 候选 |
| `openFolder(path)` | `POST /api/open-folder` body `{path}` | 在文件管理器打开分组目录 |

辅助纯函数：`parseLogText`（`[ISO] msg` → 结构化）、`mergeEntries`（按时间合并）、`parseEnvs`/`stringifyEnvs`（KEY=VALUE 多行 ↔ 对象）。

## 类型契约（`src/lib/types.ts`，镜像后端 `toPublicRecord`）

```ts
type ProcessStatus = "spawning" | "running" | "exited" | "error";
interface ProcessView { id; name; script; args; cwd; status; pid; exitCode; error; desc?; startedAt?; stoppedAt? }
interface ProcessListResponse { serverId; pid; processes: ProcessView[] }
interface LogsResponse { stream: "stdout"|"stderr"; text: string }
interface LogEntry { timestamp: number; stream; message }
interface StartProcessBody { name?; script; args?; cwd; envs?; desc? }
interface WsProcessesMessage { type:"processes"; serverId?; pid?; startedAt?; data: ProcessView[]; snapshot? }
interface WsLogMessage { type:"log"; processId; stream; timestamp; message }
```

> 后端 `toPublicRecord`/`toPublicView` 字段变动时，必须同步本文件。

## 鉴权

若后端设了 `PROCM_HTTP_TOKEN`：REST 需带 `Authorization: Bearer <token>`，WS 需 `?token=<token>`（页面 URL 传入）。当前 `lib/api.ts` **未自动注入** token；`lib/ws.ts` 只从页面 URL `?token=` 取。受 token 保护的后端上 dashboard 需把 token 放进页面 URL（如 `http://127.0.0.1:7331/?token=xxx`）。
