# 对外接口

## MCP 工具

**stdio（11 个）**：`start-process`、`batch-process`、`process`、`process-logs`、`process-log-files`、`log-files`、`process-input`、`procm-command`、`room`、`room-logs`、`trace-get`。
**`/mcp` HTTP（10 个）**：同上去掉 `process-input`（HTTP MCP 不注册输入工具；可用 REST `POST /api/processes/:id/input` 或 dashboard 代替）。

| 工具 | 参数 | 说明 |
|---|---|---|
| `start-process` | `script`(必) `cwd`(必) `name?` `args?[]` `envs?{}` `desc?` `port?` `roomId?` `group?` | 启动进程。仅 `validateScript`（拒绝含空格/`=` 的 script），**无白名单/审批**。`roomId` 让进程加入房间（重启保留）；`group` 为 Dashboard 分组标签（重启保留）。Windows 上裸命令经 `resolveSpawnTarget` 解析 `.cmd`/`.bat`。 |
| `batch-process` | `action`(必) + `processes?[]`/`ids?[]` `concurrency?` | 批量 start 或 restart；≤100 项、有界并发（batch-process MCP 工具上限）、逐项 `{ok,...}` 结果。 |
| `process` | `action`(必) `id?` `status?` `group?` | `action` ∈ `get`/`delete`/`restart`/`list`；get/delete/restart 需 `id`。list 默认只返回 `running`，可按 `status`（含 `all`）和 `group` 过滤。delete 默认 SIGTERM，10s 未退出则 SIGKILL。 |
| `process-logs` | `id`(必) `stream?` `pattern?` `count?` `ignoreCase?` | 无 pattern → tail（默认 stdout，count 10）；有 pattern → 正则 grep（默认 50，可搜双流）。 |
| `process-log-files` | `id`(必) | 返回指定进程 stdout/stderr 日志文件绝对路径，支持历史进程。 |
| `log-files` | `processId?` `stream?` `limit?` | 列出历史日志文件及绝对路径，按修改时间倒序，可按进程/流筛选。 |
| `process-input` | `id`(必) `text?` `newline?` `signal?` | `text` 写 stdin（`newline` 默认 true）或 `signal` 发信号；二选一。signal ∈ `SIGINT`/`SIGTERM`/`SIGKILL`/`SIGHUP`/`SIGUSR1`/`SIGUSR2`/`SIGTSTP`/`SIGCONT`/`SIGQUIT`。**stdio 限定。** |
| `procm-command` | `action`(必) `name?` `cwd?` | `action` ∈ `list`/`start`；start 需 `name`，读项目根 `procm-commands.json` 按名启动（`cwd` 相对项目目录解析为绝对路径）。 |
| `room` | `action`(必) `roomId?` `title?` `note?` | `action` ∈ `list`/`get`/`update`；房间元数据 + 活跃成员。 |
| `room-logs` | `roomId`(必) `memberPrefix?` `level?` `traceId?` `count?` | 合并房间成员结构化日志（marker 解析自各进程 `.log`），可按成员前缀/级别/trace ID 过滤。 |
| `trace-get` | `id`(必) | 读当前实例内存中的完整 trace；`{ok:true,trace}` 或 `{ok:false,error:{code}}`（`TRACE_NOT_FOUND` 等稳定码）。 |

## REST API（同源，绑 `127.0.0.1`）

进程路由按正则 `/^\/api\/processes(?:\/([^/]+))?(?:\/(stop|restart|logs|log-files|log-download|command|input))?$/` 匹配。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/processes` | 合并内存+历史记录，按 `startedAt` 倒序 |
| POST | `/api/processes` | 启动（body `{script,name?,args?[],cwd,envs?,desc?,port?,roomId?,group?}`）→ `{id,name}` |
| DELETE | `/api/processes` | 批量删除（body `{ids?}`，空即全部） |
| GET | `/api/processes/:id` | 单进程详情（活进程视图） |
| GET | `/api/processes/:id/logs?stream=&count=&grep=&ignoreCase=&after=` | tail 或 grep（活 client 或磁盘 `.log`） |
| GET | `/api/processes/:id/log-files` | `{stdoutPath, stderrPath}` |
| GET | `/api/processes/:id/command` | 可粘贴运行的命令（cd + env 前缀 + 脚本参数，按平台引号） |
| GET | `/api/processes/:id/log-download` | 合并双流 `.log` 作为附件下载 |
| POST | `/api/processes/:id/stop` | 停止并删除 |
| POST | `/api/processes/:id/restart` | 重启 |
| POST | `/api/processes/:id/input` | body `{text?,newline?,signal?}` → 写 stdin 或发信号（镜像 `process-input`） |
| DELETE | `/api/processes/:id` | 停止 + 删除记录 |
| GET | `/api/meta` | `{serverId, pid, cwd, startedAt}` |
| GET | `/api/rooms` | 房间列表（元数据 + 活跃成员） |
| GET / PATCH | `/api/rooms/:roomId` | 查看 / 更新房间 title/note |
| GET | `/api/rooms/:roomId/logs?memberPrefix=&level=&traceId=&count=` | 合并房间结构化日志 |
| GET | `/api/system-processes` | OS 级进程列表（pid/ppid/name/cmd/exe/ports） |
| POST | `/api/favorites/scan` | body `{path}` 扫项目清单 → `{candidates}`（无状态，dashboard 存 localStorage） |
| POST | `/api/open-folder` | body `{path}` 调 `explorer`/`open`/`xdg-open` |
| POST | `/api/reveal` | 在文件管理器中定位文件 |

鉴权：设了 `PROCM_HTTP_TOKEN` 则每个非预检请求需 `Authorization: Bearer <token>`。

## `/mcp`（MCP-over-HTTP）

`POST|GET|DELETE /mcp` → Streamable HTTP，stateless（每请求新建 transport+server），8 工具。`OPTIONS /mcp` 在 token 检查前做 CORS 预检，反射 Origin。连接配置：`{"type":"http","url":"http://127.0.0.1:<port>/mcp"}`。

## WebSocket（双端点）

- **`/ws`**（dashboard）：连接即发 `{type:"processes",snapshot:true,...}` 快照；之后 `PROCESS_CHANGE` → `{type:"processes",...}`，`LOG_APPEND` → `{type:"log",processId,stream,timestamp,message}`。
- **`/room`**（SDK 房间协议）：`@procm-mcp/sdk` `ProcmClient` 接入；hello/welcome、subscribe/publish（prefix/retain）、member 事件、`trace:put`/`trace:stored`、ping/pong——帧定义见 SDK 包 `protocol.ts`。托管进程自动获 `PROCM_WS_URL` 指向此端点。

鉴权两端口相同：`?token=` 或 `bearer.<token>` 子协议。

## CLI 客户端

`node build/index.js <cmd> [--port <n>] [--token <t>]`：`ps`、`info <id>`、`logs <id> [--stream] [-n]`、`grep <id> <pattern> [--stream] [-n] [-i]`、`start <script> [args...] [--cwd <dir>] [--name <n>] [--env KEY=VAL ...]`、`restart <id>`、`stop <id>`、`ping`。

## procm-commands.json

项目根定义可复用命名命令：

```json
{ "commands": { "dev": { "script": "npm", "args": ["run", "dev"], "cwd": "." } } }
```

`procm-command(start)` 按 `name` 启动，`cwd` 相对项目目录（含该文件的目录）解析为绝对路径。
