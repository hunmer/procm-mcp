# 对外接口

procm-mcp 对外暴露四类接口：**MCP 工具**（stdio 与 `/mcp`）、**REST API**（HTTP）、**CLI 子命令**、**`procm-commands.json` 约定**。

## MCP 工具（共 5 个）

stdio MCP 与 HTTP `/mcp` 暴露**完全相同**的 5 个工具。`/mcp` 走 Streamable HTTP transport（stateless，无 sessionId）。同类操作已合并为「名词工具 + `action` 枚举」。

### 进程生命周期
| 工具 | 入参 | 说明 |
|---|---|---|
| `start-process` | `script`(必) `name?` `args?[]` `cwd`(必) `envs?{}` | 受 allow-x 约束；`validateScript` 拒绝含空格/`=` 的 script |
| `process` | `action`(必) `id?` | `action` ∈ `get`/`delete`/`restart`/`list`；get/delete/restart 需 `id`；list 忽略 id。delete 停止并移除（SIGTERM 10s 后 SIGKILL）；restart 保 id 与位置重启 |

### 日志
| 工具 | 入参 | 说明 |
|---|---|---|
| `process-logs` | `id`(必) `stream?` `pattern?` `ignoreCase?=false` `count?` | 无 `pattern`=取最近 N 条（`stream` 默认 stdout，`count` 默认 10）；有 `pattern`=正则搜索（不传 stream 则双流，`count` 默认 50，结果按时间倒序） |

### allow-x 白名单
| 工具 | 入参 | 说明 |
|---|---|---|
| `allowed-process` | `action`(必) `script?` `args?[]` `cwd?` | `action` ∈ `allow`/`delete`/`list`；allow/delete 需 `script`（默认 cwd=process.cwd()）；list 可用 `cwd` 过滤 |

### procm-commands
| 工具 | 入参 | 说明 |
|---|---|---|
| `procm-command` | `action`(必) `name?` `cwd?` | `action` ∈ `list`/`start`；start 需 `name`，**仍走 allow-x** |

> 工具结果统一为 MCP `CallToolResult`（`{content:[{type:"text",text}]}`），由 `tool-helpers.ts` 构造。
> `serverId` 不再有专用工具，但仍在 REST `GET /api/meta` 与 `GET /api/processes` 的响应里返回。

## REST API（HTTP，`127.0.0.1`）

所有路由受 `PROCM_HTTP_TOKEN` 鉴权（若设置）。请求体上限 1 MiB。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | dashboard 页面（构建产物或「未构建」提示页） |
| GET | `/assets/*` | dashboard 静态资源（仅当 dist 存在） |
| POST/GET/DELETE | `/mcp` | MCP Streamable HTTP 端点（stateless） |
| GET | `/api/processes` | `{serverId, pid, processes:[ProcessView]}` |
| GET | `/api/processes/:id` | 单进程 `ProcessView` |
| GET | `/api/processes/:id/logs?stream=stdout\|stderr&count=200[&grep=...&ignoreCase=1]` | 日志；带 `grep` 走正则搜索。停止/过期进程从磁盘 `.log`/`.json` 读 |
| POST | `/api/processes` | body `{script,name?,args?[],cwd,envs?,desc?}` → `{id,name}`；**绕过 allow-x**（人类驱动） |
| DELETE | `/api/processes` | 批量删除（clear all）。body `{ids?:string[]}`，省略则删全部。单次读写存储避免 lowdb 竞态 |
| POST | `/api/processes/:id/stop` | 停止并删除 |
| POST | `/api/processes/:id/restart` | 重启 |
| DELETE | `/api/processes/:id` | 停止（若运行中）并擦除持久化记录 |
| GET | `/api/processes/:id/log-files` | 该进程两个 `.log` 文件的绝对路径（`{stdoutPath,stderrPath}`，可能为 null） |
| GET | `/api/processes/:id/log-download` | 合并、按时间排序的日志作为附件下载 |
| GET | `/api/processes/:id/command` | 单行可粘贴的复现命令（`cd … && ENV=val script args`，按后端 OS 格式化） |

`ProcessRecord`（`toPublicRecord`，含生命周期时间戳）：`{id,name,script,args,cwd,status,pid,exitCode,error,desc,startedAt,stoppedAt}`。`GET /api/processes` 返回**内存活进程 + 持久化历史记录**的合并视图（活进程优先，停止/退出的仍可见）。`ProcessView`（`toPublicView`，单进程）少 `startedAt`/`stoppedAt`。两者都**不含** ChildProcess / stdoutClient 等内部字段。

### 辅助路由

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/meta` | `{serverId,pid,cwd,startedAt}`——dashboard 用于自动填充 cwd 等 |
| POST | `/api/favorites/scan` | body `{path}`，扫描目录顶层 `package.json`/`pyproject.toml`/`Cargo.toml`，返回候选启动命令 `{candidates:ScanCandidate[]}`（纯建议，后端不存 favorites） |
| POST | `/api/open-folder` | body `{path}`，用 explorer/open/xdg-open 在文件管理器打开目录（校验存在且为目录） |

## WebSocket `/ws`

与 REST 同源、同端口。`attachWebsocketServer` 在 `server.on("upgrade")` 里接管 `/ws` 路径（其他 upgrade 路径如 dev HMR 不处理）。token 鉴权同 REST：`?token=<token>` 查询串或 `sec-websocket-protocol: bearer.<token>` 子协议。

- 连接即推一份完整进程快照（`{type:"processes",snapshot:true,...}`）。
- 进程状态变更（经 `dashboardEvents.emitProcessChange`，微任务内合并）→ 推 `{type:"processes",data:[...]}`。
- 每条新日志（经 `dashboardEvents.emitLog`）→ 推 `{type:"log",processId,stream,timestamp,message}`。
- dashboard 客户端用指数退避自动重连（`dashboard/src/lib/ws.ts`）。

## CLI 子命令（客户端模式）

`procm-mcp <command> [args] [--port <n>] [--token <t>]`。端口默认 `--port` > `PROCM_HTTP_PORT` > `7331`；token 默认 `--token` > `PROCM_HTTP_TOKEN`。

| 命令 | 用法 |
|---|---|
| `ps` | 列进程 |
| `info <id>` | 详情 |
| `logs <id> [--stream stdout\|stderr] [-n <count>]` | 取最近日志 |
| `grep <id> <pattern> [--stream s] [-n <count>] [-i\|--ignore-case]` | 正则搜 |
| `start <script> [args...] [--cwd <dir>] [--name <n>] [--env KEY=VAL ...]` | 启动（绕过 allow-x） |
| `restart <id>` / `stop <id>` | 重启 / 停删 |
| `ping` | 探活后端 |

## `procm-commands.json`

项目根的可选配置文件，定义可复用命名命令：

```json
{
  "commands": {
    "dev": { "script": "npm", "args": ["run", "dev"], "cwd": ".", "envs": {} }
  }
}
```

- `cwd` 相对项目目录（含该文件的目录）解析，`path.resolve(projectDir, cwd)`，缺省回退到项目目录。
- 通过 `procm-command`（action `start`）启动**仍受 allow-x 约束**（按解析后的绝对 cwd 匹配）。

## 客户端配置示例

stdio：`{"command":"node","args":["./build/index.js"]}`。
HTTP：`{"type":"http","url":"http://127.0.0.1:<port>/mcp"}`（可选 `headers.Authorization`）。
