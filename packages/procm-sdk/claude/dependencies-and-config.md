# 依赖与配置

## 依赖

| 依赖 | 用途 |
|---|---|
| `callsites` 4.2.0（唯一运行时依赖） | `hook.ts` 捕获函数调用链 |
| devDeps: `typescript` ^5.8.3 | 构建 |

浏览器/Node 全局依赖：`WebSocket`、`crypto.randomUUID`、`TextEncoder/TextDecoder`、`btoa/atob`、`performance.now`、`setTimeout/setInterval`、`AbortSignal`（Node ≥22 均有；Node 无全局 WebSocket 的场景注入 `webSocketFactory`，demo 用 `ws` 包）。

## 环境变量（client.ts 自动发现，options 显式传入优先）

| 变量 | 作用 | 缺省 |
|---|---|---|
| `PROCM_ROOM_ID` | 房间 id（**必需**，构造时缺失即抛错） | — |
| `PROCM_WS_URL` | WS 地址（如 `ws://127.0.0.1:7331/room`） | — |
| `PROCM_PROCESS_ID` | 托管进程 id（后端 `connection-config.ts` 注入） | — |
| `PROCM_CLIENT_NAME` | 成员显示名 | `"client"` |
| `PROCM_HTTP_TOKEN` | 鉴权 token（URL `?token=` + 子协议 `bearer.<token>` 双通道） | 不鉴权 |

后端 `startProcess` 会给托管进程自动注入以上全套（`PROCM_ROOM_ID` 需 start 时传 `roomId`）。

## 配置文件

| 文件 | 作用 |
|---|---|
| `package.json` | `@hunmer/procm-mcp-sdk`、ESM only、`files: ["dist"]`、`engines.node >= 22`、`main/types/exports` 指 dist |
| `tsconfig.json` | `tsc -p` 构建（declaration + sourcemap 出 dist） |

## 与 monorepo 的关系

- 根 `package.json` `workspaces: ["packages/*"]`，后端依赖 `"@hunmer/procm-mcp-sdk": "^0.1.0"`（workspace 解析）；dashboard 也 import 其 `decodeStructuredLogLine`。
- `dist/` 构建产物**随仓库提交**——根构建链 `npm run build` = `build:sdk` → `sync:demos` → `build:dashboard` → `tsc`，SDK 排第一。
