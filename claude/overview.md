# 架构总览

procm-mcp 是一个 **进程管理 MCP 服务器**：让 LLM（以及人类操作者）通过统一接口启动、监控、重启、停止子进程，并读取其 stdout / stderr 日志。

## 解决的问题

LLM 在辅助开发时常需要启动长期运行的进程（dev server、docker-compose、test watcher）。直接让模型调用 shell 不安全——无法收敛可执行的命令范围。procm-mcp 用 **allow-x 模式** 平衡安全与易用：

- 模型想启动某进程时，先调用 `allow-start-process` 把「script + args + cwd」三元组加入白名单（**此步需要人类确认**）。
- 一旦放行，后续相同三元组的 `start-process` / `start-procm-command` 无需再确认即可执行。

## 关键设计取舍

### 1. 两种运行形态共享同一套核心
后端有三种入口，但都落到同一组「模块级单例」状态上：

- **stdio MCP 模式**（默认）：作为 MCP 服务器经 stdin/stdout 协议通信；可选附带 HTTP dashboard。
- **HTTP 后端模式**（`--server`）：纯 HTTP 服务，不带 stdio MCP transport，dashboard 始终启动，进程常驻。
- **CLI 客户端模式**（`ps`/`info`/`start`/...）：连接到一个已在运行的 `--server` 后端，发 HTTP 请求后退出。**不启动后端**。

`/mcp` 端点在 HTTP 端口上额外暴露 **Streamable HTTP transport** 的 MCP 协议（无状态），让只能讲 HTTP 的 MCP 客户端也能接入。

### 2. 状态在模块级单例里，不在 MCP 会话里
进程列表（`processes: ProcessMetadata[]`）、allow-all 开关、server id 都是模块级变量。因此 stdio MCP、HTTP REST、`/mcp` HTTP、dashboard 四条路径看到的是**同一份**进程状态——一个进程在任意路径启动后，其余路径立即可见。`/mcp` 之所以选 **stateless**（每请求新建 transport+server），正是因为状态不依赖会话。

### 3. allow-x 只守 LLM 路径
- `start-process` / `start-procm-command`（MCP 工具）→ 受 allow-x 约束。
- dashboard 的 `POST /api/processes`、CLI 客户端的 `start` → **故意绕过** allow-x，因为它们是人类驱动的本地 UI/CLI，等价于你在终端敲命令。
- `--allow-all` / `PROCM_ALLOW_ALL=1` 可在受信任环境整体关闭 allow-x（仅影响 LLM 路径）。

### 4. 日志双写：结构化 JSON + 原始文本
每个进程的 stdout/stderr 各自被一个 `ProcessStdoutClient` 消费：
- **lowdb JSON 文件**（`<id>-<stdout|stderr>.json`）：结构化记录 `{timestamp, message}`，供 `top`(取最近 N 条) 与 `search`(正则) 查询。
- **append 文本文件**（`<id>-<stdout|stderr>.log`）：原始文本，便于人工查看。
- 写入经一个串行 `updateQueue`，保证顺序且 `top`/`search` 会等待队列排空（`await updateQueue.processing`）后再读，避免读到半截状态。

### 5. 进程树清理
停止进程用 `tree-kill`。在 Windows 上 SIGTERM 不被支持，统一走 SIGKILL（映射到 `taskkill /T /F`），确保 `cmd /c` 衍生的子进程也被回收。默认先 SIGTERM，10 秒未退出则强制 SIGKILL（Windows 始终 SIGKILL）。进程退出时通过 `beforeExit`/`SIGINT`/`SIGTERM`/`uncaughtException`/stdin-close 触发幂等的 `cleanup()` 回收全部子进程。

### 6. 临时目录即数据目录
运行时数据落在 `os.tmpdir()/procm-mcp/<serverId>/` 下，包含 `debug.log`、`allowed-process-creations.json`（在上级 `procm-mcp/` 目录）、以及每个进程的 `processes/<id>-*.json|log`。`serverId` 是启动时生成的 6 位 nanoid。

## 运行时边界

- HTTP dashboard **只绑定 `127.0.0.1`**，不对外暴露。
- 可选 `PROCM_HTTP_TOKEN`：所有 HTTP 请求需带 `Authorization: Bearer <token>`（dashboard、REST、`/mcp` 一并受保护）。
- 请求体上限 1 MiB（`readBody`）。
