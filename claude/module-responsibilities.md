# 模块职责

分层：入口/分流 → 领域核心（进程 + 日志）→ 房间/追踪子域 → 适配层（MCP 工具 / HTTP REST / WS）。

## 入口与客户端

| 文件 | 职责 |
|---|---|
| `index.ts` | **主入口**。`parseArgs` 解析 `--server`/`--port`/`--data-path`/`--help`；按优先级分流：CLI 客户端命令 → `--server` HTTP 后端 → 默认 stdio MCP。安装进程信号处理器（`SIGINT`/`SIGTERM`/`beforeExit`/`uncaughtException` + stdio 模式 stdin-close 触发幂等 `cleanup()` + `closeTraceStore()`）。注册 8 组共 14 个 stdio 工具。启动时 `serverLog` 回显一行启动配置 JSON（argv/mode/cliPort/envHttpPort/dataDir/cwd；`--server` 打 stdout，stdio 模式打 stderr 避免污染协议通道）。 |
| `cli-client.ts` | **HTTP 客户端**。连一个已运行后端，**不**起后端。子命令 `ps/info/logs/grep/start/edit/import/import-batch/clear-logs/clear-process-logs/select-directory/restart/stop/ping/mcptool`；`--port`/`PROCM_HTTP_PORT` 选端口，`--token`/`PROCM_HTTP_TOKEN` 带 `Authorization: Bearer`。 |
| `connection-config.ts` | HTTP 服务启动时记下 `ws://127.0.0.1:<port>/room` 与 token；`getConnectionEnv()` 供 `startProcess` 注入 `PROCM_WS_URL`/`PROCM_HTTP_TOKEN` 给被管进程。 |

## 领域核心

| 文件 | 职责 |
|---|---|
| `process-manager.ts` ★ | **进程生命周期核心**。模块级 `processes[]` 单例；`startProcess/killProcess/removeProcess/deleteProcess/deleteProcesses/restartProcess/cleanup`；`spawn` 子进程并接线 stdout/stderr client + 房间环境注入；`validateScript`/`createCommand`/`generateProcessId`；**`resolveSpawnTarget`**（Windows 上按 `PATHEXT` 解析裸命令到 `.cmd`/`.bat` 并转 shell 启动）；**`shouldIgnoreStdin`**（win32 且 pnpm/npm/yarn/bun + run/exec/dlx 时子进程 stdin 设 `ignore`，修复 piped stdin 经 cmd→tsx watch 不启动）；`updateProcessFields`（name/script/args/cwd/desc/port/envs/group 持久化合并）；`sendProcessInput`（写 stdin 或发 `ALLOWED_INPUT_SIGNALS` 信号）；`listProcessRecords`(合并内存+持久化历史)/`reconcileStaleProcesses`(启动时回收孤儿 PID)；状态变更 `emitProcessChange()` + `persist()` 落盘。 |
| `process-stdout-client.ts` | **每流捕获**。2000 行内存环形缓冲 + append-only `<serverId>/processes/<id>-<type>.log`；`top`(tail)/`search`(grep + after 上下文)；新行 `emitLog()`。 |
| `processes-repository.ts` | **持久化历史**。lowdb JSON 存 `<数据目录>/processes.json`（`{processes: ProcessRecord[]}`）；`ProcessRecord`/`list`/`save`/`removeMany`。 |
| `process-log-files.ts` | **日志文件层**。`getProcessLogPaths`（活/历史双路解析 stdout/stderr 路径）、`listProcessLogFiles`（历史日志文件清单，倒序）、`deleteProcessLogFiles`（删非运行进程日志）、`clearProcessLogs`（清空进程 stdout/stderr 历史：运行中清内存缓冲，历史记录截断日志文件）。 |
| `types.ts` | `ProcessStatus = "spawning"\|"running"\|"exited"\|"error"`、`ProcessMetadata`。 |
| `events.ts` | **进程内事件总线**。`dashboardEvents`（EventEmitter）暴露 `PROCESS_CHANGE`/`LOG_APPEND`/`LOG_CLEAR`（`emitLogClear(processId)` 清空日志广播）；进程状态变更在微任务内合并（burst coalesce）。 |
| `project-scanner.ts` | **无状态扫描器**。读目录顶层清单（package.json/pyproject.toml/Cargo.toml/procm-commands.json）推导可启动命令候选（给 favorites 导入用）。 |
| `system-processes.ts` | **OS 级进程列表**（dashboard System Tab 数据源）。ps-list/find-process 聚合 pid/ppid/name/cmd/exe/ports（get-ports-natively 扫监听端口）；支持按 pid kill（tree-kill）。 |

## 房间子域

| 文件 | 职责 |
|---|---|
| `room-hub.ts` ★ | **`/room` 协议实现**（SDK ServerFrame 侧）。管理 Session（socket+member+订阅）；hello/welcome 握手、成员 joined/left/replaced 广播、publish 路由（精确/prefix 匹配、retain 保留）、ping/pong；处理 `trace:put` 转发 trace-store；导出 REST 用的 `listRooms/getRoom/patchRoom`。 |
| `room-repository.ts` | lowdb 存 `<数据目录>/rooms.json`（`RoomRecord`: id/title/note/processIds/时间戳）。 |
| `room-logs.ts` | **合并房间结构化日志**。按 room 的 processIds 读各进程磁盘 `.log`，`decodeStructuredLogLine`（SDK）还原 marker 条目 → `RoomLogEntry`；支持 memberPrefix/level/count/时间窗口（`startTime`/`endTime`，Unix 毫秒包含边界）过滤。 |

## 追踪子域

| 文件 | 职责 |
|---|---|
| `trace-store.ts` ★ | **内存 trace 存储**。LRUCache：总量 64 MiB、单条 256 KiB、TTL 1~604800s（默认 86400）；`putTrace`（校验+冲突检测 `TRACE_STORE_CONFLICT` 等）/`getTrace`/`closeTraceStore`；`TraceStoreError(code)` 稳定错误码。 |

## 适配层

| 文件 | 职责 |
|---|---|
| `http-server.ts` | **REST + dashboard + /mcp 委托 + WS 挂载**。绑 `127.0.0.1`；可选 `PROCM_HTTP_TOKEN`；路由 `/api/processes*`（含 `PATCH :id` 字段合并、`POST import`/`import-batch`、`:id/{logs,log-files,log-download,command,input}`）、`/api/server-log` 三件套（状态/设上限/清理）、`/api/rooms(/:id(/logs))`、`/api/favorites/scan`、`/api/open-folder`、`/api/reveal`、`/api/system-processes`、`/api/select-directory`；日志 grep/下载/命令重建（`buildCommand`）；把 `/mcp` 交给 `mcp-http.ts`，upgrade 交给 `websocket-server.ts`。 |
| `mcp-http.ts` | **`/mcp` MCP-over-HTTP**。Streamable HTTP，stateless（每请求新建 transport+server），注册 7 组 **13 个工具**（含 api-operations 组，仍无 `process-input`）；CORS 反射 Origin。 |
| `websocket-server.ts` | **WS 双端点**。挂 HTTP `upgrade`：`/ws` → dashboard 推送（连接即发 `processes` 快照，之后 `PROCESS_CHANGE`→`processes`（顶层带 `port`）、`LOG_APPEND`→`log`、`LOG_CLEAR`→`logCleared`，每连接串行快照队列防乱序）；`/room` → `room-hub` 的 `attachRoomSocket`。`?token=`/`bearer.<token>` 鉴权两端口共用。 |
| `dashboard-html.ts` | 托管 `dashboard/dist` 静态包；解析 dist 目录、规范化 `index.html`、带路径穿越防护的 asset 服务；dist 缺失返回「未构建」提示页。 |

## 工具层（`src/tools/`，8 文件 14 工具）

| 文件 | 工具 |
|---|---|
| `process.ts` | `start-process`（script/name/args/cwd/envs/desc/port/roomId/group，仅 `validateScript`，**无白名单**）/ `batch-process`（批量启动或重启，≤100 项、有界并发、逐项结果）/ `process`（action ∈ get/delete/restart/list + id）。 |
| `process-logs.ts` | `process-logs`（id/stream/pattern/count/ignoreCase；tail 或 grep）。 |
| `process-log-files.ts` | `process-log-files`（按 id 取 stdout/stderr 日志文件绝对路径，支持历史进程）/ `log-files`（历史日志文件清单，倒序，可按进程/流筛选）。 |
| `process-input.ts` | `process-input`（id/text/newline/signal；text 或 signal 二选一；signal ∈ `ALLOWED_INPUT_SIGNALS`）。**仅 stdio 注册。** |
| `procm-commands.ts` | `procm-command`（action ∈ list/start；读项目根 `procm-commands.json` 按名启动）。 |
| `room.ts` | `room`（action ∈ list/get/update：房间元数据与活跃成员）、`room-logs`（合并结构化日志，memberPrefix/level/traceId/count/startTime/endTime 过滤）。 |
| `trace.ts` | `trace-get`（按精确 id 读完整 trace；`{ok:true,trace}` 或稳定错误码）。 |
| `api-operations.ts` | `clear-process-logs`（清空进程 stdout/stderr 历史，清空后 `emitLogClear`）/ `import-process-batch`（批量导入 favorite 配置）/ `select-directory`（原生目录选择器，经 `native-directory.ts` 异步执行）。 |

## 支撑

`server-log.ts`（`serverId` nanoid + 日志包装）、`server-dir.ts`（`<serverId>` 子目录）、`procm-mcp-dir.ts`（数据目录根：`--data-path` > `PROCM_MCP_DIR` > `<tmpdir>/procm-mcp`）、`native-directory.ts`（原生目录选择器 `pickDirectory()`：macOS 走 osascript（用户取消返回 `"UserCancelled"`），其他平台经 `createRequire` 懒加载 `native-file-dialog` 的 `folder_dialog`——该包只发编译好的 .node addon，ESM 无法直接 import；加载失败不能拖垮启动；异步子进程执行不阻塞事件循环）、`logger.ts`（写 `debug.log`；单文件大小上限 `settings.json` > `PROCM_DEBUG_LOG_MAX_BYTES` > 默认 20MB，超限 `truncateSync` 整体清空重写；`setDebugLogMaxBytes`/`getDebugLogSettings`/`listDebugLogFiles`/`clearDebugLogDirs` 支撑 `/api/server-log*`）、`error.ts`（`toErrorMessage`）、`tool-helpers.ts`（`textResult`/`notFoundResult`）、`sleep.ts`。
