# procm-mcp

[English](README.md) | 简体中文

一个用于**进程管理**的 Model Context Protocol (MCP) 服务器。

## 功能特性

- 安全、可自动化的进程创建
- 终止时自动清理所创建的进程（例如退出 Claude Code 时）
- 常用进程管理能力：重启、删除、查看状态、读取进程 stdout/stderr
- 基于房间的 WebSocket 消息、保留的就绪信号（retained readiness signals）、结构化日志与批量进程操作

借助这些能力，LLM 可以启动开发服务器、docker-compose、测试 watcher 等进程，并读取它们的输出以自动修复问题。

## 从源码运行

克隆仓库、安装依赖并在本地构建：

```bash
git clone https://github.com/hunmer/procm-mcp.git
cd procm-mcp
npm install
npm run build
```

### stdio MCP 模式

通过 stdio 启动 MCP 服务器，将 dashboard 置于 `7331` 端口，并使用用户级共享数据目录：

```bash
node ./build/index.js --port 7331 --data-path global
```

在 MCP 客户端的项目配置中启用同一命令（例如 `.mcp.json`）：

```json
{
  "mcpServers": {
    "procm-mcp": {
      "command": "procm-mcp",
      "args": ["--port", "7331", "--data-path", "global"]
    }
  }
}
```

## 安装

```powershell
npm i -g @hunmer/procm-mcp
```

### AI 一键安装

让 AI Agent 在终端依次执行：

```powershell
npm i -g @hunmer/procm-mcp
npx skills add hunmer/procm-mcp --skill procm-http procm-rooms procm-init -y
Start-Process -FilePath "procm-mcp" -ArgumentList "--server", "--port", "7331", "--data-path", "global"
Start-Process "http://127.0.0.1:7331"
```

需要启用或重启服务器时，使用全局 `procm-mcp` 管理；自带热更新的服务不需要重启。
如果 MCP 不可用，则加载 `procm-http` skill，使用 HTTP 作为兜底。

然后将以下 MCP 配置添加到客户端：

```json
{
  "mcpServers": {
    "procm-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:7331/mcp"
    }
  }
}
```

最后，将以下规则添加到项目的 `AGENTS.md` 或 `CLAUDE.md`，让 AI Agent 遵循统一的
进程管理规范：

```text
需要启用或重启服务器时（自带热更新的服务不需要重启），使用全局 procm-mcp 管理。
如果 MCP 不可用，则加载 procm-http skill，使用 HTTP 兜底。
```

### Agent Skills

将两个 skill 安装到当前项目：

```bash
npx skills add hunmer/procm-mcp --skill procm-http procm-rooms procm-init -y
```

只安装一个时使用 `--skill <name>`（可选 `procm-http`、`procm-rooms` 或
`procm-init`）。`procm-init` skill 会探索项目启动脚本，生成供
审核的 `procm-commands.json`。
`skills` CLI 会检测当前 agent，并安装到对应的项目级 skills 目录；Codex 对应
`.agents/skills/`。

## Dashboard（HTTP）

可选的 Web dashboard 让你在浏览器中查看和管理运行中的进程。它**默认关闭**，启用后仅绑定 `127.0.0.1`，不可从网络访问。

dashboard 是 React + coss 前端（位于 `dashboard/`），以预构建产物形式提供：Node 后端托管 `dashboard/dist/index.html` 及其 `/assets/*` 包。从 npm 安装 procm-mcp 时构建产物随包分发。如果你从源码运行，请先构建 dashboard：

```bash
npm run build:dashboard   # 构建 dashboard/ -> dashboard/dist
# 或一次构建全部（dashboard + 后端）：
npm run build
```

若产物缺失，`GET /` 会返回一个「dashboard 未构建」提示页（附构建命令）而不是报错；REST API 仍然可用。

在 MCP 服务器的环境变量中设置 `PROCM_HTTP_PORT` 即可启用：

```json
{
  "mcpServers": {
    "procm-mcp": {
      "command": "procm-mcp",
      "env": { "PROCM_HTTP_PORT": "7331" }
    }
  }
}
```

然后打开 `http://127.0.0.1:7331`。可选的 `PROCM_HTTP_TOKEN` 要求每个请求携带 `Authorization: Bearer <token>` 头。

dashboard 可以列出进程、查看 stdout/stderr、启动/停止/重启进程。从 dashboard 启动进程是人工驱动的 localhost 操作，等价于你自己在终端里执行该命令。

HTTP API（同源）：

- `GET  /` → dashboard 页面
- `GET  /api/processes` → 进程列表 `{ serverId, pid, processes: [...] }`
- `GET  /api/processes/:id` → 单进程详情
- `GET  /api/processes/:id/logs?stream=stdout|stderr&count=200` → 最近日志行
- `POST /api/processes` → 启动进程（body：`{ script, name?, args?, cwd, envs?, desc?, port?, roomId?, group? }`）
- `POST /api/processes/:id/stop` → 停止并保留历史
- `POST /api/processes/:id/restart` → 重启
- `GET  /api/rooms` → 房间列表（元数据 + 活跃成员）
- `GET|PATCH /api/rooms/:roomId` → 查看 / 更新房间 title/note
- `GET  /api/rooms/:roomId/logs?memberPrefix=&level=&traceId=&count=` → 合并的房间结构化日志
- `GET  /api/server-log` → 服务端调试日志状态（目录、大小上限、文件清单）
- `PUT  /api/server-log/settings` → 设置 debug.log 大小上限（字节；`null` 恢复默认）
- `DELETE /api/server-log` → 清理服务端日志文件

### 后端模式（`--server`）

默认情况下 procm-mcp 以 stdio MCP 服务器运行（dashboard 可经 `PROCM_HTTP_PORT` 可选启用）。传入 `--server` 则作为**独立 HTTP 后端**运行：没有 MCP stdio 传输，dashboard 必然启动，进程常驻服务。适合把 procm-mcp 当作长驻后台服务，由你（或其他工具）纯经 HTTP 驱动。

```bash
# dashboard 使用默认端口 7331
procm-mcp --server

# 或指定端口
procm-mcp --server --port 8080

# 隔离本实例的进程历史与日志
procm-mcp --server --port 8080 --data-path .procm-mcp-data
```

`--port <number>` 在默认（stdio）模式下同样可用：无需设置 `PROCM_HTTP_PORT` 即可启动 dashboard，且优先级高于它。
如果指定端口已被占用，procm-mcp 会自动选择下一个可用端口，并在启动日志中报告实际端口。

`--data-path <path>` 选择进程历史、房间与日志的存放目录。相对路径以当前工作目录解析。不带该参数时数据存放在进程工作目录下的 `.procm-mcp`。使用 `--data-path global` 则使用用户级 `~/.procm-mcp` 目录。设置 `PROCM_MCP_DIR` 也仍然有效。

### 经 HTTP 连接（`type: "http"`）

当 procm-mcp 运行在 HTTP 端口上（`--server`，或 `--port`/`PROCM_HTTP_PORT`）时，它会在 **`/mcp`** 暴露一个真正的 MCP 端点（Streamable HTTP 传输）。这让只支持 MCP-over-HTTP 的客户端也能接入，而不必使用 stdio。

先运行后端（例如在独立终端 / 作为服务）：

```bash
procm-mcp --server --port 7331
```

然后把 MCP 客户端指向它：

```json
{
  "mcpServers": {
    "procm-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:7331/mcp"
    }
  }
}
```

说明：

- 进程、批量操作、日志、命令、房间等工具均可在 `/mcp` 上使用。stdio 额外暴露 `process-input`（写进程 stdin / 发送信号）。
- 进程状态共享：经 `/mcp` 启动的进程在 dashboard 与 REST API 中可见，反之亦然。
- 若设置了 `PROCM_HTTP_TOKEN`，在客户端支持的配置中加入（`"headers": { "Authorization": "Bearer <token>" }`）。
- `/mcp` 以 **stateless** 模式运行（无会话 ID）——每个请求相互独立。

## procm-commands.json

在项目根目录的 `procm-commands.json` 中定义可复用的命名命令：

```json
{
  "commands": {
    "dev": { "script": "npm", "args": ["run", "dev"] },
    "test": { "script": "npm", "args": ["test"], "cwd": "." },
    "db": { "script": "docker", "args": ["compose", "up"], "envs": { "COMPOSE_FILE": "docker-compose.yml" } }
  }
}
```

`procm-command` 工具（action `list`）返回文件内容与可用命令名。用 `procm-command`（action `start`）按名启动。每个命令的 `cwd` 相对项目目录（即包含 `procm-commands.json` 的目录）解析。

房间客户端安装单独发布的 TypeScript SDK：

```bash
npm i @hunmer/procm-mcp-sdk
```

```ts
import { createLogger, createProcmClient } from "@hunmer/procm-mcp-sdk";

const client = createProcmClient({ clientName: "backend" });
const logger = createLogger({ client });

client.subscribe("debug:", (message) => console.log(message.payload), { prefix: true });
client.publish("backend:ready", { initialized: true }, { retain: true });
await client.waitFor("frontend:ready", { timeout: 30_000 });
logger.info("Backend ready", { pid: process.pid });
```

### 函数 hook 与内存 trace

Trace 存储内建于每个 procm-mcp 进程，无需外部服务。trace 默认 24 小时过期，`PROCM_TRACE_TTL_SECONDS` 可修改默认值（允许 1..604800 秒）。单条 trace JSON 序列化后上限 256 KiB，LRU 缓存总量上限 64 MiB。

```ts
import { createHook, createLogger, createProcmClient, saveTrace } from "@hunmer/procm-mcp-sdk";

const client = createProcmClient({ clientName: "backend" });
const logger = createLogger({ client });

const fetchUser = createHook(async (id: string) => ({ id }), {
  client,
  name: "fetchUser",
  captureArgs: true,
  captureResult: true,
});

fetchUser.before(({ traceId, args }) => {
  logger.info("fetchUser called", { userId: args[0] as string }, { traceId });
});

const user = await fetchUser("42");
const diagnosticId = await saveTrace(client, { kind: "diagnostic", user });
```

`createHook` 保留 `this`、同步返回类型、Promise 行为与原始抛出/拒绝的错误。同步的 `before` 处理器可调用 `setArgs()`/`skip()`；同步的 `after` 处理器可调用 `setResult()`。参数/结果捕获默认关闭。`hookProperty()` 仅支持 configurable 的自有属性，并返回幂等的 restore 函数。运行时位置是 V8 JavaScript 位置；不支持 source-map 转换，也不支持拦截局部变量、闭包或只读 ESM 绑定。

Hook 的 trace 存储是异步的，且绝不向应用 console 写 trace 详情或存储状态。`saveTrace()` 是显式确认 API，仅当当前 procm-mcp 实例接受记录后才 resolve。超时、中止、断连、非法 TTL、不安全 JSON 与超大载荷都会 reject，且不泄漏挂起请求。

在同一个 HTTP Stream MCP 实例上使用 `trace-get` 工具，传入 `{ "id": "<traceId>" }`。它返回 `{ "ok": true, "trace": ... }`，或 `{ "ok": false, "error": ... }` 且带稳定错误码之一：`TRACE_NOT_FOUND`、`TRACE_INVALID_ID`、`TRACE_INVALID_PAYLOAD`、`TRACE_STORE_CONFLICT`、`TRACE_STORE_ERROR`、`TRACE_REQUEST_TIMEOUT`。

Trace 数据刻意设计为临时性的。重启 procm-mcp 会清空它；LRU 逐出可能在 TTL 之前移除较旧条目；多个 procm-mcp 进程之间不共享 trace。

Trace 验证：

```bash
npm run build:sdk
npm run build
npm test
npm run test:trace
npm run test:custom-noise
```

被管进程自动获得 `PROCM_ROOM_ID`、`PROCM_PROCESS_ID`、`PROCM_WS_URL` 与可选的鉴权信息。显式的 SDK 选项会覆盖环境变量。Node.js 与 Electron 的工作流示例见 `demo/`。

## 进程创建没有内置门控

`start-process` 与 `procm-command`（action `start`）直接执行给定命令。procm-mcp **不**限制可以启动哪些命令——没有白名单、allow-list 或审批门控。请像对待任何能执行任意 shell 命令的工具那样对待 `start-process`：保持人工确认（多数 MCP 客户端的默认行为），并只在其隐含的命令集合可接受的环境中运行 procm-mcp。

面向网络的场景下，可选的 `PROCM_HTTP_TOKEN` 要求每个 HTTP / `/mcp` / dashboard 请求携带 `Authorization: Bearer <token>` 头，使仅绑定本地的服务器不会被其他能触达 `127.0.0.1` 的程序驱动。

## 工具

- `start-process` 以指定脚本与参数启动新进程
  - `script`（必填）：要执行的脚本/命令
  - `cwd`（必填）：进程工作目录
  - `args`（可选）：传给脚本的参数数组
  - `name`（可选）：进程的友好名称
  - `envs`（可选）：为进程设置的环境变量
  - `desc`（可选）：人类可读的描述
  - `port`（可选）：服务端口元数据
  - `roomId`（可选）：加入的房间；重启后保留
  - `group`（可选）：Dashboard 分组标签；重启后保留
- `batch-process` 以有界并发启动或重启最多 100 个进程，逐项返回结果
- `process` 按 ID 管理进程，或列出全部进程
  - `action`（必填）：`get` | `delete` | `restart` | `list`
  - `id`（get/delete/restart 必填）：进程 ID
  - `delete` 停止并删除指定进程。默认信号为 SIGTERM，若进程 10 秒内未退出则发送 SIGKILL（强杀）
- `process-logs` 按 ID 读取进程日志（tail 最近日志，或用正则 grep）
  - `id`（必填）：进程 ID
  - `pattern`（可选）：正则表达式。省略则 tail 最近若干条
  - `stream`（可选）：`"stdout"` 或 `"stderr"`。tail 默认 `"stdout"`；grep 模式下省略则搜索双流
  - `count`（可选）：返回条数（tail 默认 10，grep 默认 50）
  - `ignoreCase`（可选）：忽略大小写（默认 false）
- `process-log-files` 返回进程 stdout/stderr 日志文件的绝对路径（含历史）
- `log-files` 列出历史进程日志文件及绝对路径，按修改时间倒序，可按进程与流筛选
  - `processId`（可选）：按进程 ID 筛选
  - `stream`（可选）：`"stdout"` 或 `"stderr"`
  - `limit`（可选）：返回条数上限
- `process-input` 向进程 stdin 写入或发送 OS 信号（仅 stdio MCP——`/mcp` 不暴露；请用 dashboard 或 REST）
  - `id`（必填）：进程 ID
  - `text`（可选）：写入进程 stdin 的字符串
  - `newline`（可选）：在 `text` 末尾追加换行（默认 true；设 false 发送原始字节）
  - `signal`（可选）：改为发送 OS 信号——`SIGINT` `SIGTERM` `SIGKILL` `SIGHUP` `SIGUSR1` `SIGUSR2` `SIGTSTP` `SIGCONT` `SIGQUIT` 之一。`text`/`signal` 二选一
- `procm-command` 管理定义在 `procm-commands.json` 中的进程
  - `action`（必填）：`list` | `start`
  - `name`（start 必填）：文件中定义的命令名
  - `cwd`（可选）：包含 `procm-commands.json` 的项目目录（默认：当前工作目录）
- `room` 列出、查看或更新房间元数据与活跃成员
- `room-logs` 合并房间结构化日志，可按成员前缀、级别、trace ID、时间窗过滤
- `trace-get` 按精确 ID 读取当前 procm-mcp 实例内存中的完整 trace
- `clear-process-logs` 清空进程 stdout/stderr 历史（运行中清内存缓冲并截断日志文件，之后继续记录）
- `import-process-batch` 批量导入进程配置（不启动），存为可收藏记录
- `select-directory` 弹出系统原生目录选择器，返回所选路径

## 许可证

MIT
