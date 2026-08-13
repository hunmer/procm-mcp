# 架构总览

procm-mcp 让 LLM（经 MCP）与人类操作者（经 dashboard / CLI）管理子进程：启动、查看、重启、停止、写 stdin / 发信号、读 stdout/stderr。

## 运行形态（共享同一份模块级状态）

1. **stdio MCP（默认）**：`node build/index.js`，经 stdio 说 MCP 协议，注册 **5 个工具**。
2. **HTTP 后端（`--server`）**：不跑 stdio MCP，dashboard 必启，进程常驻服务 HTTP。
3. **CLI 客户端**：`node build/index.js ps|info|logs|grep|start|restart|stop|ping`，连接一个已运行的后端（不发起新后端）。

额外两个 HTTP 入口（`--server` 或设了 `--port`/`PROCM_HTTP_PORT` 时启用，均只绑 `127.0.0.1`）：

- **`/mcp`**：Streamable HTTP 传输的 MCP 端点，**stateless**（每请求新建 transport+server），注册 **4 个工具**（比 stdio 少 `process-input`）。
- **dashboard**：`GET /` 托管的 React 静态包 + 同源 REST `/api/*` + WebSocket `/ws`。

进程列表（`processes: ProcessMetadata[]`）、server id 都是模块级变量。因此 stdio MCP、HTTP REST、`/mcp` HTTP、dashboard 四条路径看到的是**同一份**进程状态——一个进程在任意路径启动后，其余路径立即可见。`/mcp` 之所以选 stateless，正是因为状态不依赖会话。

## 关键设计取舍

- **进程启动无门控**：`start-process` / `procm-command(start)` 直接执行命令，没有白名单/审批。三条启动路径（MCP 工具、dashboard `POST /api/processes`、CLI `start`）行为一致——都等价于在终端敲命令。把 `start-process` 当作任意 shell 命令工具对待，保留客户端的人工确认。
- **历史全局、日志按实例隔离**：`processes.json`（进程历史）在 `<tmpdir>/procm-mcp/` 根级，跨重启/跨 server 共享；而 `debug.log` 与每个进程的 `.log` 在 `<serverId>/` 子目录下，按实例隔离。`serverId` 是启动时生成的 6 位 nanoid，每次重启变化。
- **日志双写**：内存环形缓冲（2000 行/流，供 tail/grep）+ 磁盘 append-only `.log`（供停止后仍可读、可下载）。
- **实时推送解耦**：生产者（`process-manager`、`process-stdout-client`）只 `emit` 到 `events.ts` 的 EventEmitter；`websocket-server.ts` 订阅并广播给 `/ws` 连接。进程状态变更在微任务内合并，避免短时风暴。
- **本地绑定 + 可选 token**：HTTP/WS 仅 `127.0.0.1`；`PROCM_HTTP_TOKEN` 开启后所有 HTTP/`/mcp`/dashboard 请求需 `Authorization: Bearer <token>`，WS 用 `?token=` 或 `bearer.<token>` 子协议。
