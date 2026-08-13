# 依赖与配置

## 运行时依赖（`package.json`）

| 依赖 | 用途 |
|---|---|
| `@modelcontextprotocol/sdk` | MCP 服务器/传输（stdio + Streamable HTTP） |
| `zod` | 工具入参 schema |
| `lowdb` | `processes.json` 历史持久化 |
| `tree-kill` | 递归杀进程树（带子进程） |
| `ws` | WebSocket `/ws` 实时推送 |
| `nanoid` | 进程 id（8 位）/ serverId（6 位） |

开发依赖：`typescript`、`@types/node`、`@types/ws`、`@modelcontextprotocol/inspector`（`npm run inspect`）。

## 环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `PROCM_HTTP_PORT` | dashboard/HTTP 端口（stdio 模式下启用 dashboard） | 不启用 |
| `PROCM_HTTP_TOKEN` | 所有 HTTP/`/mcp`/dashboard 请求需 `Authorization: Bearer <token>` | 无（不鉴权） |

CLI flag：`--server`（HTTP 后端模式）、`--port <n>`（覆盖 `PROCM_HTTP_PORT`）、`-h/--help`。

> 注：不存在 `--allow-all` / `PROCM_ALLOW_ALL` / 白名单开关——进程启动本就无门控。

## 配置文件

| 文件 | 作用 |
|---|---|
| `package.json` | `type: module`、scripts、`files: ["build","dashboard/dist"]`（发布内容） |
| `tsconfig.json` | ESM/Node16、`verbatimModuleSyntax`、源 import 需 `.js` 后缀 |
| `.mcp.json` | 本仓自用 MCP 配置示例 |
| `server.json` | MCP 工具描述元数据 |

## 运行时数据落点（`<os.tmpdir()>/procm-mcp/`）

| 路径 | 作用 | 作用域 |
|---|---|---|
| `processes.json` | 进程历史（lowdb，`{processes: ProcessRecord[]}`） | 全局，跨重启/跨 server 共享 |
| `<serverId>/debug.log` | 后端调试日志 | 按实例（serverId） |
| `<serverId>/processes/<id>-stdout.log` | 进程 stdout（append-only，行分隔） | 按实例 |
| `<serverId>/processes/<id>-stderr.log` | 进程 stderr | 按实例 |

`serverId` = 启动生成的 6 位 nanoid，每次重启变化（日志按实例隔离，历史全局共享）。无 allowlist 文件。
