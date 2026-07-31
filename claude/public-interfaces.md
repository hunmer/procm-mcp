# 对外接口

procm-mcp 对外暴露四类接口：**MCP 工具**（stdio 与 `/mcp`）、**REST API**（HTTP）、**CLI 子命令**、**`procm-commands.json` 约定**。

## MCP 工具（共 14 个）

stdio MCP 与 HTTP `/mcp` 暴露**完全相同**的 14 个工具。`/mcp` 走 Streamable HTTP transport（stateless，无 sessionId）。

### allow-x 白名单
| 工具 | 入参 | 说明 |
|---|---|---|
| `allow-start-process` | `script`(必) `args?[]` `cwd?` | 把三元组加入白名单 |
| `list-allowed-processes-in-cwd` | `cwd?` | 列出某 cwd 下的已放行项 |
| `delete-allowed-process` | `script`(必) `args?[]` `cwd?` | 删除一条放行 |

### 进程生命周期
| 工具 | 入参 | 说明 |
|---|---|---|
| `start-process` | `script`(必) `name?` `args?[]` `cwd`(必) `envs?{}` | 受 allow-x 约束；`validateScript` 拒绝含空格/`=` 的 script |
| `delete-process` | `id` | 停止并移除；SIGTERM 10s 后 SIGKILL |
| `restart-process` | `id` | 保 id 与位置重启 |
| `get-process-info` | `id` | 详情（pid/status/exitCode/...） |
| `list-processes` | — | 当前进程列表 |

### 日志
| 工具 | 入参 | 说明 |
|---|---|---|
| `get-process-stdout` | `id` `chunkCount?=10` | 取最近 N 条 stdout |
| `get-process-stderr` | `id` `chunkCount?=10` | 取最近 N 条 stderr |
| `grep-process-logs` | `id` `pattern` `stream?` `ignoreCase?=false` `count?=50` | 正则搜索；不传 stream 则双流；结果按时间倒序 |

### procm-commands
| 工具 | 入参 | 说明 |
|---|---|---|
| `get-procm-commands` | `cwd?` | 读项目根 `procm-commands.json`，返回内容与命令名列表 |
| `start-procm-command` | `name`(必) `cwd?` | 按名启动；**仍走 allow-x** |

### 服务信息
| 工具 | 入参 | 说明 |
|---|---|---|
| `get-server-id` | — | 返回 serverId |

> 工具结果统一为 MCP `CallToolResult`（`{content:[{type:"text",text}]}`），由 `tool-helpers.ts` 构造。

## REST API（HTTP，`127.0.0.1`）

所有路由受 `PROCM_HTTP_TOKEN` 鉴权（若设置）。请求体上限 1 MiB。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | dashboard 页面（构建产物或「未构建」提示页） |
| GET | `/assets/*` | dashboard 静态资源（仅当 dist 存在） |
| POST/GET/DELETE | `/mcp` | MCP Streamable HTTP 端点（stateless） |
| GET | `/api/processes` | `{serverId, pid, processes:[ProcessView]}` |
| GET | `/api/processes/:id` | 单进程 `ProcessView` |
| GET | `/api/processes/:id/logs?stream=stdout\|stderr&count=200[&grep=...&ignoreCase=1]` | 日志；带 `grep` 走正则搜索 |
| POST | `/api/processes` | body `{script,name?,args?[],cwd,envs?{}}` → `{id,name}`；**绕过 allow-x**（人类驱动） |
| POST | `/api/processes/:id/stop` | 停止并删除 |
| POST | `/api/processes/:id/restart` | 重启 |

`ProcessView`（`toPublicView`）：`{id,name,script,args,cwd,status,pid,exitCode,error}`——**不含** ChildProcess 与 stdoutClient 等内部字段。

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
- 通过 `start-procm-command` 启动**仍受 allow-x 约束**（按解析后的绝对 cwd 匹配）。

## 客户端配置示例

stdio：`{"command":"node","args":["./build/index.js"]}`。
HTTP：`{"type":"http","url":"http://127.0.0.1:<port>/mcp"}`（可选 `headers.Authorization`）。
