# 入口与启动流程

## `src/index.ts` 主入口

`parseArgs(argv)` 识别 `--server` / `--port <n>` / `--port=<n>` / `--data-path <path>` / `-h,--help`。分流顺序：

1. **CLI 客户端**（最高优先级）：首个位置参数属于 `ps/info/logs/grep/start/edit/import/import-batch/clear-logs/clear-process-logs/select-directory/restart/stop/ping/mcptool` 时，`runClient` 连一个已运行后端并退出，**不**起后端。
2. **`--server`（HTTP 后端）**：端口取 `--port` → `PROCM_HTTP_PORT` → `7331`；跑 `reconcileStaleProcesses()` → `startHttpServer(port)` → 安装信号处理器 → 常驻服务。无 stdio MCP。
3. **默认（stdio MCP）**：建 `McpServer`，注册 8 组 14 工具，`reconcileStaleProcesses()`，安装信号处理器（stdio 模式额外：stdin-close → cleanup+exit），按需启 dashboard（`--port` 或 `PROCM_HTTP_PORT`），最后连 `StdioServerTransport`。

`--data-path` 在分流前生效：解析为绝对路径覆写 `PROCM_MCP_DIR`，决定 `processes.json`/`rooms.json`/`settings.json`/日志的数据目录。

启动时 `serverLog` 回显一行启动配置 JSON：`{ argv, mode, cliPort, envHttpPort, dataDir, cwd }`——`--server` 模式打 stdout，stdio 模式打 stderr（stdout 是 MCP 协议通道）。

`serverId` 在 `server-log.ts` 启动时生成（6 位 nanoid），每次重启变化；进程历史全局共享故跨重启可见。

## 信号处理

`installSignalHandlers`：`beforeExit`/`SIGINT`/`SIGTERM`/`uncaughtException` 均调用幂等 `cleanup()`（停所有子进程并落盘）+ `closeTraceStore()`（关 trace LRU 定时器）；stdio 模式下 stdin 关闭（客户端断开）也触发 cleanup+exit。`cleanup` 幂等，多处理器调用安全。

## 启动回收 `reconcileStaleProcesses`

两模式启动时都先跑：把上次后端崩溃/SIGKILL 留下的「running」记录的孤儿 PID kill 掉并标记 exited，再开始服务（dashboard 才不会显示幽灵进程）。

## 构建

- `npm run build` = `build:sdk`（SDK 先编，后端依赖它）→ `sync:demos`（electron demo 安装依赖）→ `build:dashboard`（→ `dashboard/dist`）→ `tsc`（→ `build/`）。运行入口 `build/index.js`。
- `tsc` **不删除**源已删的产物——若从源里删了 `.ts`，对应 `build/*.js` 会残留成孤儿。清理需 `rm -rf build && npm run build`（如本轮移除 allow-x 后即如此）。
- `package.json` `files` 发布 `["build","dashboard/dist"]`。
