# 架构总览

procm-mcp 让 LLM（经 MCP）与人类操作者（经 dashboard / CLI）管理子进程：启动、查看、重启、停止、写 stdin / 发信号、读 stdout/stderr。在此之上叠加两个子域：**房间**（room——被管进程间经 WebSocket `/room` 互发消息/结构化日志，协议由 `@procm-mcp/sdk` 定义）与**追踪**（trace——SDK hook 捕获的函数调用存内存 LRU，LLM 经 `trace-get` 读取）。

## 运行形态（共享同一份模块级状态）

1. **stdio MCP（默认）**：`node build/index.js`，经 stdio 说 MCP 协议，注册 **9 个工具**。
2. **HTTP 后端（`--server`）**：不跑 stdio MCP，dashboard 必启，进程常驻服务 HTTP。
3. **CLI 客户端**：`node build/index.js ps|info|logs|grep|start|restart|stop|ping`，连接一个已运行的后端（不发起新后端）。

额外两个 HTTP 入口（`--server` 或设了 `--port`/`PROCM_HTTP_PORT` 时启用，均只绑 `127.0.0.1`）：

- **`/mcp`**：Streamable HTTP 传输的 MCP 端点，**stateless**（每请求新建 transport+server），注册 **8 个工具**（比 stdio 少 `process-input`）。
- **dashboard**：`GET /` 托管的 React 静态包 + 同源 REST `/api/*` + WebSocket。

两个 WebSocket 端点（同一 HTTP server 的 `upgrade` 分发）：

- **`/ws`**：dashboard 专用——推进程列表与日志行（`websocket-server.ts`）。
- **`/room`**：SDK 房间协议——`@procm-mcp/sdk` 的 `ProcmClient` 接入（`room-hub.ts`），承载消息/成员事件/结构化日志上报/trace:put。被管进程启动时自动注入 `PROCM_WS_URL` 指向它。

进程列表（`processes: ProcessMetadata[]`）、server id、room hub、trace store 都是模块级变量。因此 stdio MCP、HTTP REST、`/mcp` HTTP、dashboard 四条路径看到的是**同一份**进程状态。`/mcp` 之所以选 stateless，正是因为状态不依赖会话。

## 关键设计取舍

- **进程启动无门控**：`start-process` / `procm-command(start)` 直接执行命令，没有白名单/审批。三条启动路径（MCP 工具、dashboard `POST /api/processes`、CLI `start`）行为一致——都等价于在终端敲命令。把 `start-process` 当作任意 shell 命令工具对待，保留客户端的人工确认。
- **历史全局、日志按实例隔离**：`processes.json`/`rooms.json`（历史与房间元数据）在数据目录根级，跨重启/跨 server 共享；而 `debug.log` 与每个进程的 `.log` 在 `<serverId>/` 子目录下，按实例隔离。`serverId` 是启动时生成的 6 位 nanoid，每次重启变化。数据目录 = `--data-path` > `PROCM_MCP_DIR` > `<tmpdir>/procm-mcp`。
- **日志双写**：内存环形缓冲（2000 行/流，供 tail/grep）+ 磁盘 append-only `.log`（供停止后仍可读、可下载）。
- **实时推送解耦**：生产者（`process-manager`、`process-stdout-client`）只 `emit` 到 `events.ts` 的 EventEmitter；`websocket-server.ts` 订阅并广播给 `/ws` 连接。进程状态变更在微任务内合并，避免短时风暴。
- **trace 刻意 ephemeral**：`trace-store.ts` 纯内存 LRU（总量 64 MiB、单条 256 KiB、TTL 1s~7d、默认 24h），不持久化、跨实例不共享——定位"当次会话的函数级诊断"，不是审计存储。
- **本地绑定 + 可选 token**：HTTP/WS 仅 `127.0.0.1`；`PROCM_HTTP_TOKEN` 开启后所有 HTTP/`/mcp`/dashboard 请求需 `Authorization: Bearer <token>`，WS（`/ws` 与 `/room`）用 `?token=` 或 `bearer.<token>` 子协议；token 同时注入被管进程环境（SDK 自动带上）。
- **Windows spawn 兼容**：`resolveSpawnTarget` 把裸命令（`npm` 等）按 `PATHEXT` 解析到 `.cmd`/`.bat` shim 并经 shell 启动（直接 spawn 批处理在新版 Node 抛 EINVAL）；非 Windows 原样透传。
