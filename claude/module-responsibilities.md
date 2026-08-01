# 模块职责

后端是一个平铺的 `src/` 目录（非 monorepo），按职责切分为几组文件。下图与说明覆盖每个源文件的「是什么 / 管什么」。

## 分层关系（文字版）

```
入口层        index.ts (CLI 解析 + 启动) · cli-client.ts (客户端模式)
              mcp-http.ts (/mcp transport)
协议层        tools/*.ts (MCP 工具注册) · http-server.ts (REST + 静态资源 + /mcp 路由)
              websocket-server.ts (/ws 实时推送) · events.ts (进程内事件总线)
领域核心      process-manager.ts (进程生命周期) · allowed-process-creations.ts (allow-x 白名单)
              processes-repository.ts (进程历史持久化) · process-stdout-client.ts + logs-repository.ts (日志)
              project-scanner.ts (项目清单扫描 → favorites 候选)
基础设施      server-log.ts · logger.ts · procm-mcp-dir.ts · server-dir.ts · types.ts
              error.ts · sleep.ts · tool-helpers.ts · dashboard-html.ts
```

## 文件职责清单

| 文件 | 职责 |
|---|---|
| `index.ts` | **主入口**。解析 CLI 参数（`--server`/`--port`/`--allow-all`/`--help`），根据模式分流到 stdio MCP / HTTP 后端 / CLI 客户端；安装进程信号处理器；调用 `cleanup()`。 |
| `cli-client.ts` | **CLI 客户端模式**。识别 `ps/info/logs/grep/start/restart/stop/ping` 子命令，向运行中的 `--server` 后端发 HTTP 请求后退出。不启动后端。 |
| `mcp-http.ts` | **MCP-over-HTTP**。在 `/mcp` 上用 Streamable HTTP transport（stateless）暴露全部 MCP 工具，每请求新建 transport+server。 |
| `http-server.ts` | **HTTP 服务器**。`127.0.0.1` 绑定，token 鉴权，路由：`GET /`（dashboard）、`/assets/*`（静态）、`/mcp`（委派 mcp-http）、`/api/processes[/:id[/action]]`（REST）。 |
| `dashboard-html.ts` | 解析 dashboard `dist/` 目录、读 `index.html`、按 MIME 提供 `/assets/*`、缺失时返回「未构建」提示页；含路径穿越防护。 |
| `process-manager.ts` | **进程生命周期核心**。模块级 `processes[]` 单例；`startProcess/killProcess/removeProcess/restartProcess/cleanup`；`spawn` 子进程并接线 stdout/stderr client；`validateScript`/`createCommand`/`generateProcessId`；allow-all 开关；`listProcessRecords`(合并内存+持久化历史)/`deleteProcesses`(批量)/`reconcileStaleProcesses`(启动时回收孤儿 PID)；状态变更触发 `persist()` 落盘。 |
| `allowed-process-creations.ts` | **allow-x 白名单持久化**。在 `tmpdir/procm-mcp/allowed-process-creations.json` 上 CRUD，按 `{script,args,cwd}` 三元组精确匹配。 |
| `processes-repository.ts` | **进程历史持久化**（lowdb）。`ProcessRecord` 形状（剥离内部字段 + 生命周期时间戳 + 日志路径）；`upsert/getAll/getById/remove/removeMany`。`removeMany` 单次读写避免并发复活行。 |
| `events.ts` | **进程内事件总线**（EventEmitter）。`emitProcessChange`(微任务内合并 burst)/`emitLog`；`PROCESS_CHANGE`/`LOG_APPEND` 事件。解耦数据生产者与 WS 广播器。 |
| `websocket-server.ts` | **/ws 实时推送**。挂到现有 http.Server 的 upgrade 事件；连接即发快照，订阅 dashboardEvents 推进程变更/日志行；token 鉴权（query 或子协议）。 |
| `project-scanner.ts` | **项目清单扫描**。读目录顶层 `package.json`/`pyproject.toml`/`Cargo.toml`，派生可启动命令候选给 dashboard 导入为 favorites。纯建议，不写盘不递归。 |
| `process-stdout-client.ts` | **日志消费**。绑定子进程 stdout/stderr readable，每 chunk 三路：实时 emit `dashboardEvents.emitLog` + 双写（lowdb JSON + 文本 log），经串行 `updateQueue`；提供 `top`/`search`/`close`。 |
| `logs-repository.ts` | **日志存储**（基于 lowdb）。`insert/top(按时间倒序取 N)/search(正则过滤)/close`。 |
| `tools/allowed-process.ts` | `allowed-process` 工具（`action` ∈ allow/delete/list，管理 allow-x 白名单）。 |
| `tools/process.ts` | `start-process`（含 allow-x 校验）/ `process`（`action` ∈ get/delete/restart/list）工具。 |
| `tools/process-logs.ts` | `process-logs` 工具（无 pattern=取最近 N 条；有 pattern=正则搜，可单/双流，结果按时间倒序）。 |
| `tools/procm-commands.ts` | `procm-command` 工具（`action` ∈ list/start）；读项目根 `procm-commands.json`，按名启动（仍走 allow-x）。 |
| `server-log.ts` | 生成 `serverId`(nanoid 6) / `logServerId`；`serverLog` 写文件；`logToolStart/End/Error` 包裹。 |
| `logger.ts` | `log()` 向 `<serverDir>/debug.log` 追加带时间戳的行（同步 appendFileSync）。 |
| `procm-mcp-dir.ts` | 返回 `tmpdir/procm-mcp`（运行时数据根）。 |
| `server-dir.ts` | 返回 `<procmMcpDir>/<serverId>`（本次运行专属子目录）。 |
| `types.ts` | `ProcessStatus`、`ProcessMetadata` 核心类型。 |
| `error.ts` | `isError` 类型守卫、`toErrorMessage` 统一错误字符串。 |
| `sleep.ts` | `sleep(ms)` 工具（当前仅测试/内部用）。 |
| `tool-helpers.ts` | `textResult` / `notFoundResult`：构造标准 MCP `CallToolResult`。 |

## 子域划分

- **入口与协议**：`index.ts`、`cli-client.ts`、`mcp-http.ts`、`http-server.ts`、`dashboard-html.ts`、`websocket-server.ts`、`events.ts`。
- **进程领域**：`process-manager.ts`、`allowed-process-creations.ts`、`processes-repository.ts`、`types.ts`。
- **日志领域**：`process-stdout-client.ts`、`logs-repository.ts`。
- **辅助**：`project-scanner.ts`（favorites 扫描）。
- **MCP 工具**：`tools/*.ts`（4 个文件，对应 4 组注册函数，共 5 个工具）。
- **基础设施**：`server-log.ts`、`logger.ts`、`procm-mcp-dir.ts`、`server-dir.ts`、`error.ts`、`sleep.ts`、`tool-helpers.ts`。
