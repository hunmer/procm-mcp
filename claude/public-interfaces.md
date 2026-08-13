# 对外接口

## MCP 工具

**stdio（5 个）**：`start-process`、`process`、`process-logs`、`process-input`、`procm-command`。
**`/mcp` HTTP（4 个）**：同上去掉 `process-input`（HTTP MCP 不注册输入工具；可用 REST `/api/processes/:id/input` 或 dashboard 代替）。

| 工具 | 参数 | 说明 |
|---|---|---|
| `start-process` | `script`(必) `name?` `args?[]` `cwd`(必) `envs?{}` `desc?` | 启动进程。仅 `validateScript`（拒绝含空格/`=` 的 script），**无白名单/审批**。 |
| `process` | `action`(必) `id?` | `action` ∈ `get`/`delete`/`restart`/`list`；get/delete/restart 需 `id`；list 忽略 id。delete 默认 SIGTERM，10s 未退出则 SIGKILL。 |
| `process-logs` | `id`(必) `stream?` `pattern?` `count?` `ignoreCase?` | 无 pattern → tail（默认 stdout，count 10）；有 pattern → 正则 grep（默认 50，可搜双流）。 |
| `process-input` | `id`(必) `text?` `newline?` `signal?` | `text` 写 stdin（`newline` 默认 true）或 `signal` 发信号；二选一。signal ∈ `SIGINT`/`SIGTERM`/`SIGKILL`/`SIGHUP`/`SIGUSR1`/`SIGUSR2`/`SIGTSTP`/`SIGCONT`/`SIGQUIT`。**stdio 限定。** |
| `procm-command` | `action`(必) `name?` `cwd?` | `action` ∈ `list`/`start`；start 需 `name`，读项目根 `procm-commands.json` 按名启动（`cwd` 相对项目目录解析为绝对路径）。 |

## REST API（同源，绑 `127.0.0.1`）

进程路由按正则 `/^\/api\/processes(?:\/([^/]+))?(?:\/(stop|restart|logs|log-files|log-download|command|input))?$/` 匹配。

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/processes` | 合并内存+历史记录，按 `startedAt` 倒序 |
| POST | `/api/processes` | 启动（body `{script,name?,args?[],cwd,envs?,desc?}`）→ `{id,name}` |
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
| POST | `/api/favorites/scan` | body `{path}` 扫项目清单 → `{candidates}`（无状态，dashboard 存 localStorage） |
| POST | `/api/open-folder` | body `{path}` 调 `explorer`/`open`/`xdg-open` |

鉴权：设了 `PROCM_HTTP_TOKEN` 则每个非预检请求需 `Authorization: Bearer <token>`。

## `/mcp`（MCP-over-HTTP）

`POST|GET|DELETE /mcp` → Streamable HTTP，stateless（每请求新建 transport+server），4 工具。`OPTIONS /mcp` 在 token 检查前做 CORS 预检，反射 Origin。连接配置：`{"type":"http","url":"http://127.0.0.1:<port>/mcp"}`。

## WebSocket `/ws`

挂同端口同源 `upgrade`。连接即发 `{type:"processes",snapshot:true,...}` 快照；之后 `PROCESS_CHANGE` → `{type:"processes",...}`，`LOG_APPEND` → `{type:"log",processId,stream,timestamp,message}`。鉴权 `?token=` 或 `bearer.<token>` 子协议。

## CLI 客户端

`node build/index.js <cmd> [--port <n>] [--token <t>]`：`ps`、`info <id>`、`logs <id> [--stream] [-n]`、`grep <id> <pattern> [--stream] [-n] [-i]`、`start <script> [args...] [--cwd <dir>] [--name <n>] [--env KEY=VAL ...]`、`restart <id>`、`stop <id>`、`ping`。

## procm-commands.json

项目根定义可复用命名命令：

```json
{ "commands": { "dev": { "script": "npm", "args": ["run", "dev"], "cwd": "." } } }
```

`procm-command(start)` 按 `name` 启动，`cwd` 相对项目目录（含该文件的目录）解析为绝对路径。
