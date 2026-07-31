# 依赖与配置

## 运行时依赖（后端）

| 依赖 | 版本 | 用途 |
|---|---|---|
| `@modelcontextprotocol/sdk` | ^1.12.3 | MCP server、StdioServerTransport、StreamableHTTPServerTransport、类型 |
| `lowdb` | ^7.0.1 | 日志 JSON 存储（`Low` + `JSONFile`） |
| `mkdirp` | ^3.0.1 | 创建运行时数据目录 |
| `nanoid` | ^5.1.5 | serverId(6)、processId(8) |
| `tree-kill` | ^1.2.2 | 进程树终止（Windows `taskkill /T /F`） |
| `zod` | ^3.25.64 | MCP 工具入参 schema |

## 开发依赖（后端）

| 依赖 | 版本 | 用途 |
|---|---|---|
| `typescript` | ^5.8.3 | 编译 |
| `@types/node` | ^24.0.1 | Node 类型 |
| `@modelcontextprotocol/inspector` | ^0.16.1 | `npm run inspect` 调试 |

> 后端**纯 Node.js**，无前端框架。运行需 Node 能力：`child_process.spawn`、`http`、`fs`、`os.tmpdir`、全局 `fetch`（Node 18+，CLI 客户端与测试均用到）。

## dashboard 依赖（独立工程，见 `dashboard/package.json`）

React 19 + Vite 6 + Tailwind v4（`@tailwindcss/vite`）+ coss（基于 `@base-ui/react`）+ `lucide-react` 图标 + `class-variance-authority`/`clsx`/`tailwind-merge` 样式工具。

## 配置文件

| 文件 | 作用 |
|---|---|
| `package.json` | 包元数据；`bin.procm-mcp`→`build/index.js`；`files` 含 `build`、`dashboard/dist`；scripts。 |
| `tsconfig.json` | ES2022 / Node16 / strict / `outDir:build` / `rootDir:src` / `include:src/**`。 |
| `.mcp.json` | 仓库自带示例：`node ./build/index.js --secure`（注：`--secure` 非当前实现的有效 flag，见 FAQ）。 |
| `server.json` | MCP Registry 发布元数据（`io.github.coder-ka/procm-mcp`，npm transport stdio）。 |
| `.github/workflows/publish.yml` | push main → npm publish + MCP Registry 发布。 |
| `.gitignore` | 忽略 `node_modules`、`build`、`dashboard/node_modules`、`dashboard/dist`、`settings.local.json`。 |
| `skills-lock.json` | 本仓库的 agent skills 锁定文件（与运行时无关）。 |
| `procm-commands.json` | **用户项目**侧可选配置，不在本仓库根（由消费方提供）。 |

## 环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `PROCM_HTTP_PORT` | stdio 模式下启动 dashboard 的端口（被 `--port` 覆盖） | 不启动 dashboard |
| `PROCM_HTTP_TOKEN` | HTTP 鉴权 token（`Authorization: Bearer`）；保护 dashboard/REST/`/mcp` | 不鉴权 |
| `PROCM_ALLOW_ALL` | `1/true/yes/on` 关闭 allow-x（仅 LLM 路径） | 关闭（即 allow-x 生效） |

## CLI flag

| flag | 作用 |
|---|---|
| `--server` | 纯 HTTP 后端（无 stdio MCP，dashboard 必启） |
| `--port <n>` | dashboard 端口（优先级高于 `PROCM_HTTP_PORT`） |
| `--allow-all` | 关闭 allow-x（等价 `PROCM_ALLOW_ALL=1`） |
| `-h, --help` | 帮助 |

## 运行时数据落点

`os.tmpdir()` 在不同平台：Windows `%TEMP%`、macOS `/var/folders/...`、Linux `/tmp`。

```
<tmpdir>/procm-mcp/
  allowed-process-creations.json        # allow-x 白名单（全 server 共享）
  <serverId>/
    debug.log                           # server 日志
    processes/
      <processId>-stdout.json           # lowdb 结构化日志
      <processId>-stdout.log            # 原始文本
      <processId>-stderr.json
      <processId>-stderr.log
```

## 框架版本差异注意

- **Node16 ESM**：源码 import 必须带 `.js` 后缀（即使源是 `.ts`），否则运行时报错。
- **MCP SDK 版本**：`/mcp` 用 `StreamableHTTPServerTransport`，`sessionIdGenerator: undefined`（stateless）。测试用的协议版本：stdio `2024-11-05`，HTTP `2025-06-18`。
- **Windows 杀进程**：SIGTERM 不支持，统一 SIGKILL；其余平台先 SIGTERM，10s 超时再 SIGKILL。
