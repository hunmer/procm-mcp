# dashboard 对外接口

dashboard 自身是后端 `GET /` 托管的静态页面，**不对外暴露接口**。它消费后端的同源 REST API 与 WebSocket `/ws`（完整定义见根 [claude/public-interfaces.md](../claude/public-interfaces.md)）。此处只列 dashboard 实际用到的调用。

## WebSocket（`src/lib/ws.ts` `useDashboardSocket`）

同源 `/ws`，断线自动重连 + 回退倒计时。token 若在页面 URL `?token=` 则拼进 ws URL。

| 消息类型 | 字段 | 用途 |
|---|---|---|
| `processes`（含 `snapshot:true`） | `serverId, pid, startedAt, data: ProcessView[]` | 连接即发快照，之后进程变更推送。App 替换进程列表 + 算 uptime；另有 30s HTTP 轮询兜底 |
| `log` | `processId, stream, timestamp, message` | 每条新日志。匹配打开的 LogPanel 则转发，否则 +未读 |
| `logCleared` | 进程日志被清空（如 LogPanel Footer 的清空日志） | 通知打开的 LogPanel 重置本地日志缓冲 |

## REST（`src/lib/api.ts`）

### 进程记录

| 函数 | 请求 | 用途 |
|---|---|---|
| `listProcesses()` | `GET /api/processes` | 列表（WS 之外的历史兜底 + App 的 30s 轮询兜底） |
| `getProcess(id)` | `GET /api/processes/:id` | 单进程详情 |
| `startProcess(body)` | `POST /api/processes` | NewProcessDialog 启动（直接执行） |
| `updateProcess(id, patch)` | `PATCH /api/processes/:id` | 同一入口发 `{group: string\|null}`（RenameGroupDialog 整组重命名搬移）等 |
| `setProcessFavorite(id, favorite)` | `PATCH /api/processes/:id` body `{favorite}` | 收藏/取消收藏（favorite 是服务端字段） |
| `stopProcess(id)` | `POST /api/processes/:id/stop` | 停止进程 |
| `restartProcess(id)` | `POST /api/processes/:id/restart` | 重启 |
| `deleteProcessCall(id)` | `DELETE /api/processes/:id` | 删除单进程记录 |
| `clearAllProcesses(ids?)` | `DELETE /api/processes` body `{ids?}` | 批量删除（App 的 Clear all、Ungrouped 清空） |
| `clearProcessLogs(id)` | `DELETE /api/processes/:id/logs` | 清空单进程日志（LogPanel Footer） |

### 导入

| 函数 | 请求 | 用途 |
|---|---|---|
| `saveImportedProcess(body)` | `POST /api/processes/import` | 单条导入进程记录（SettingsDialog 导入，逐条重建不启动） |
| `batchImportProcesses(...)` | `POST /api/processes/import-batch` | 批量导入（ImportGroupDialog） |
| `scanDirectory(path)` | `POST /api/favorites/scan` body `{path}` | 目录扫描候选 → ImportGroupDialog 勾选 |

### 日志

| 函数 | 请求 | 用途 |
|---|---|---|
| `getLogs(id, stream, count)` | `GET /api/processes/:id/logs?stream=&count=` | 单流日志（LogPanel） |
| `grepLogs(id, stream, grep, ignoreCase, count)` | `GET /api/processes/:id/logs?...&grep=&ignoreCase=` | 正则搜索单流 |
| `getMergedLogs(id, count)` | 并行 getLogs stdout+stderr + `mergeEntries` | 合并双流历史日志 |
| `grepMergedLogs(id, grep, ignoreCase, count)` | 并行 grepLogs 双流 | 合并搜索 |
| `getLogFiles(id)` | `GET /api/processes/:id/log-files` | `{stdoutPath, stderrPath}`（打开文件位置） |
| `downloadLogUrl(id)` | `GET /api/processes/:id/log-download`（返回 URL，`<a download>` 用） | 下载合并日志 |
| `getProcessCommand(id)` | `GET /api/processes/:id/command` | 复现命令（CommandStrip 只读条 / 复制） |
| `listLogFiles()` | `GET /api/log-files` | 落盘日志文件清单（History Tab / LogFilesView） |
| `readLogFileContent(...)` | `GET /api/log-files/content` | 读取落盘日志文件内容 |
| `clearLogFiles()` | `DELETE /api/log-files` | 清空落盘日志文件 |

### server log / 系统 / 其他

| 函数 | 请求 | 用途 |
|---|---|---|
| `getServerLogInfo()` | `GET /api/server-log*`（info） | server log 文件数/总大小摘要（SettingsDialog logs Tab） |
| `updateServerLogMaxBytes(bytes)` | `PUT /api/server-log/settings` | debug.log 单文件大小上限（MB 输入；清空恢复默认 20MB/env） |
| `clearServerLogs()` | `DELETE /api/server-log` | Clear logs（SettingsDialog） |
| `systemProcesses()` | `GET /api/system-processes` | System Tab OS 进程列表（+ kill 操作同域） |
| `selectDirectory()` | `POST /api/select-directory` | 后端弹原生目录选择器（返回所选路径） |
| `openFolder(path)` | `POST /api/open-folder` body `{path}` | 在文件管理器打开分组目录 |

> Playground Tab（`playground/catalog.ts`，32 端点、6 组）镜像后端 `src/http-server.ts` 全部路由（排除静态 `/`、`/mcp`、log-download），可直接调试上述大多数端点。

辅助纯函数：`parseLogText`（`[ISO] msg` → 结构化）、`mergeEntries`（按时间合并）、`parseEnvs`/`stringifyEnvs`（KEY=VALUE 多行 ↔ 对象）。

## 类型契约（`src/lib/types.ts`，镜像后端 `toPublicRecord`）

```ts
type ProcessStatus = "spawning" | "running" | "exited" | "error";
interface ProcessView { // 17 字段
  id; name; script; args: string[]; cwd; status; pid: number|null; exitCode: number|null;
  error: string|null; desc?; group?; port?: number|null; roomId?; startedAt?; lastStartedAt?;
  stoppedAt?; favorite?: boolean;
}
interface ProcessListResponse { serverId; pid; processes: ProcessView[] }
interface LogsResponse { stream: "stdout"|"stderr"; text: string }
interface LogEntry { timestamp: number; stream; message }
interface StartProcessBody { name?; script; args?; cwd; envs?; desc? }
interface ServerLogInfo { /* server log 文件数/大小/上限摘要 */ }
interface LogFileSummary { /* 落盘日志文件条目 */ }
interface WsProcessesMessage { type:"processes"; serverId?; pid?; startedAt?; data: ProcessView[]; snapshot? }
interface WsLogMessage { type:"log"; processId; stream; timestamp; message }
// 另有 logCleared 的 WS 消息类型
```

> 后端 `toPublicRecord`/`toPublicView` 字段变动时，必须同步本文件。过滤栏的 `expired` 是 **UI-only** 值（= `stoppedAt != null`），不在后端枚举里。

## 鉴权

若后端设了 `PROCM_HTTP_TOKEN`：REST 需带 `Authorization: Bearer <token>`，WS 需 `?token=<token>`（页面 URL 传入）。当前 `lib/api.ts` **未自动注入** token；`lib/ws.ts` 只从页面 URL `?token=` 取。受 token 保护的后端上 dashboard 需把 token 放进页面 URL（如 `http://127.0.0.1:7331/?token=xxx`）。
