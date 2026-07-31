# 入口与启动

## 入口文件

- **`src/index.ts`**（编译后 `build/index.js`）— 唯一主入口。`package.json` 的 `bin.procm-mcp` 指向它，`main` 也指向它。带 `#!/usr/bin/env node`。

## 启动流程（`index.ts`）

1. `parseArgs(argv)` 解析 `--server` / `--port <n>` / `--allow-all` / `-h,--help`。
2. 计算 `allowAll = cli.allowAll || envFlag("PROCM_ALLOW_ALL")`；若开启，调用 `setAllowAll(true)` 并打印醒目 WARNING banner（stderr）。
3. **客户端模式优先判定**：首个非 `-` 位置参数若属于 `ps/info/logs/grep/start/restart/stop/ping`，则 `runClient()` 后 `exitProcess(0)`——**不启动后端**，只连一个已存在的 `--server`。
4. 分支：
   - `--server`（HTTP 后端模式）：确定端口（`--port` > `PROCM_HTTP_PORT` > `7331`），校验端口范围，`startHttpServer(port)`，打印 banner，`installSignalHandlers()`。**不建 stdio MCP transport**。
   - 否则（stdio MCP 模式）：
     - `new McpServer({name:"procm-mcp", version:"1.0.0"})`。
     - 依次注册 4 组工具：`allowed-process`、`process`、`process-logs`、`procm-commands`。
     - `installSignalHandlers({onStdinClose: true})`。
     - 可选 dashboard：`--port` 直接 `startHttpServer(cli.port)`，否则 `startHttpServerIfConfigured()`（读 `PROCM_HTTP_PORT`）。
     - `new StdioServerTransport()` + `server.connect(transport)`。

## 启动失败处理

- 端口被占用（`EADDRINUSE`）→ `startHttpServer` reject 友好提示，`index.ts` catch 后 `console.error` + `exitProcess(1)`。
- 端口非法 / 越界 → 直接报错退出。

## 信号处理（`installSignalHandlers`）

`cleanup()` 幂等（内部 `cleanupped` Promise 缓存），可被多处理器安全调用：

| 事件 | 行为 |
|---|---|
| `beforeExit` | `cleanup()` |
| `SIGINT` | `cleanup()` → `exitProcess(0)` |
| `SIGTERM` | `cleanup()` → `exitProcess(0)` |
| `uncaughtException` | 记录 → `cleanup()` → `exitProcess(1)` |
| `stdin` close（仅 stdio 模式） | `cleanup()` → `exitProcess(0)` |

stdio 模式下 stdin 关闭（客户端断开）即触发退出，是「MCP 客户端退出 → 清理子进程」的关键机制。

## 构建流程

- `tsc`（`tsconfig.json`）：`rootDir: src`、`outDir: build`、ES2022/Node16/strict。`src` → `build` 平铺，`.js` 扩展名 import 对齐。
- dashboard 是独立 Vite 工程（`dashboard/`），`npm run build:dashboard` 产出 `dashboard/dist`，由 `files` 字段打包进 npm 包。
- CI（`.github/workflows/publish.yml`）：push main → `npm ci` → `npm run build` → `npm publish` → 用 `mcp-publisher` 发布到 MCP Registry（GitHub OIDC 鉴权）。

## 全局安装（开发用）

`scripts/link-global.mjs`：`npm run build` + `npm link`，并尝试把 npm 全局 bin 目录加进 PATH（Windows 自动改 User PATH；其他平台打印指引）。之后任意终端可用 `procm-mcp`，指向当前 checkout，每次 rebuild 自动生效。
