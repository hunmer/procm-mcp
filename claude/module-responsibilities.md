# 模块职责

分层：入口/分流 → 领域核心（进程 + 日志）→ 适配层（MCP 工具 / HTTP REST / WS）。

## 入口与客户端

| 文件 | 职责 |
|---|---|
| `index.ts` | **主入口**。`parseArgs` 解析 `--server`/`--port`/`--help`；按优先级分流：CLI 客户端命令 → `--server` HTTP 后端 → 默认 stdio MCP。安装进程信号处理器（`SIGINT`/`SIGTERM`/`beforeExit`/`uncaughtException` + stdio 模式 stdin-close 触发幂等 `cleanup()`）。注册 5 个 stdio 工具。 |
| `cli-client.ts` | **HTTP 客户端**。连一个已运行后端，**不**起后端。子命令 `ps/info/logs/grep/start/restart/stop/ping`；`--port`/`PROCM_HTTP_PORT` 选端口，`--token`/`PROCM_HTTP_TOKEN` 带 `Authorization: Bearer`。 |

## 领域核心

| 文件 | 职责 |
|---|---|
| `process-manager.ts` ★ | **进程生命周期核心**。模块级 `processes[]` 单例；`startProcess/killProcess/removeProcess/deleteProcess/deleteProcesses/restartProcess/cleanup`；`spawn` 子进程并接线 stdout/stderr client；`validateScript`（拒含空格/`=` 的 script）/`createCommand`/`generateProcessId`；`sendProcessInput`（写 stdin 或发 `ALLOWED_INPUT_SIGNALS` 信号）；`listProcessRecords`(合并内存+持久化历史)/`reconcileStaleProcesses`(启动时回收孤儿 PID)；状态变更 `emitProcessChange()` + `persist()` 落盘。 |
| `process-stdout-client.ts` | **每流捕获**。2000 行内存环形缓冲 + append-only `<serverId>/processes/<id>-<type>.log`；`top`(tail)/`search`(grep + after 上下文)；新行 `emitLog()`。 |
| `processes-repository.ts` | **持久化历史**。lowdb JSON 存 `<tmpdir>/procm-mcp/processes.json`（`{processes: ProcessRecord[]}`）；`ProcessRecord`/`list`/`save`/`removeMany`。 |
| `types.ts` | `ProcessStatus = "spawning"\|"running"\|"exited"\|"error"`、`ProcessMetadata`。 |
| `events.ts` | **进程内事件总线**。`dashboardEvents`（EventEmitter）暴露 `PROCESS_CHANGE`/`LOG_APPEND`；进程状态变更在微任务内合并（burst coalesce）。 |
| `project-scanner.ts` | **无状态扫描器**。读目录顶层清单（package.json/pyproject.toml/Cargo.toml/procm-commands.json）推导可启动命令候选（给 favorites 导入用）。 |

## 适配层

| 文件 | 职责 |
|---|---|
| `http-server.ts` | **REST + dashboard + /mcp 委托 + WS 挂载**。绑 `127.0.0.1`；可选 `PROCM_HTTP_TOKEN`；路由 `/api/processes*`、`/api/meta`、`/api/favorites/scan`、`/api/open-folder`、`/api/processes/:id/{logs,log-files,log-download,command,input}`；日志 grep/下载/命令重建（`buildCommand`）；把 `/mcp` 交给 `mcp-http.ts`，`/ws` 交给 `websocket-server.ts`。 |
| `mcp-http.ts` | **`/mcp` MCP-over-HTTP**。Streamable HTTP，stateless（每请求新建 transport+server），注册 **4 个工具**（`start-process`/`process`/`process-logs`/`procm-command`，**无 `process-input`**）；CORS 反射 Origin。 |
| `websocket-server.ts` | **`/ws` 实时推送**。挂 HTTP `upgrade`；连接即发 `processes` 快照，之后 `PROCESS_CHANGE`→推 `processes`、`LOG_APPEND`→推 `log`；每连接串行快照队列防乱序；`?token=`/`bearer.<token>` 鉴权。 |
| `dashboard-html.ts` | 托管 `dashboard/dist` 静态包；解析 dist 目录、规范化 `index.html`、带路径穿越防护的 asset 服务；dist 缺失返回「未构建」提示页。 |

## 工具层（`src/tools/`）

| 文件 | 工具 |
|---|---|
| `process.ts` | `start-process`（script/name/args/cwd/envs/desc，仅 `validateScript`，**无白名单**）/ `process`（action ∈ get/delete/restart/list + id）。 |
| `process-logs.ts` | `process-logs`（id/stream/pattern/count/ignoreCase；tail 或 grep）。 |
| `process-input.ts` | `process-input`（id/text/newline/signal；text 或 signal 二选一；signal ∈ `ALLOWED_INPUT_SIGNALS`）。**仅 stdio 注册。** |
| `procm-commands.ts` | `procm-command`（action ∈ list/start；读项目根 `procm-commands.json` 按名启动）。 |

## 支撑

`server-log.ts`（`serverId` nanoid + 日志包装）、`server-dir.ts`（`<serverId>` 子目录）、`procm-mcp-dir.ts`（`<tmpdir>/procm-mcp` 根）、`logger.ts`（写 `debug.log`）、`error.ts`（`toErrorMessage`）、`tool-helpers.ts`（`textResult`/`notFoundResult`）、`sleep.ts`。
