# 日志清空通知交接

## 用户目标

为 procm SDK 增加日志清空能力；Mira Client 初始化时清空自身日志；Dashboard 当前进程的 `LogPanel` 在日志被清空后自动清空界面。

## 已完成

- SDK `packages/procm-sdk/src/rest.ts` 新增 `clearLogs(client, id?)`，默认使用 `client.processId`，底层调用 `DELETE /api/processes/:id/logs`。
- Mira Client 的 `initProcm()` 在创建客户端后调用 `clearLogs`，失败只告警，不阻断启动。
- 后端新增 `logCleared` 事件链：
  - `src/events.ts` 定义 `LOG_CLEAR` 和 `emitLogClear`。
  - `src/http-server.ts` 的 DELETE 日志路由成功后广播事件。
  - `src/tools/api-operations.ts` 的 MCP `clear-process-logs` 成功后也广播事件。
  - `src/websocket-server.ts` 向 Dashboard 客户端发送 `{ type: "logCleared", processId }`。
- Dashboard 新增 `WsLogClearedMessage` 和 WebSocket 回调；`LogPanel.tsx` 只在 `process.id` 匹配时清空 entries、搜索状态、错误和请求序号。
- Dashboard 面板按钮清空行为保持兼容。

## 验证

- 根目录 `npm run build` 通过，包含 SDK、后端、Dashboard 构建。
- `dashboard` 单独构建通过。
- `git diff --check` 通过。
- 曾通过 MCP 工具清空 `Sum29PRU`，返回 `{"id":"Sum29PRU","cleared":true}`。

## 当前问题 / 下一步

- 用户观察 `ws://localhost:5176/ws` 未收到通知。根因已修复：之前 MCP 工具路径绕过 HTTP 路由，不会广播；修复在 `src/tools/api-operations.ts`。
- 修复后必须重启实际提供 `localhost:5176/ws` 的后端实例。当前 procm 工具显示没有运行中的受管进程，因此尚未自动重启。
- 重启后可在 Chrome Console 验证：

```js
const ws = new WebSocket("ws://localhost:5176/ws");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

然后执行：

```js
fetch("/api/processes/Sum29PRU/logs", { method: "DELETE" })
  .then((r) => r.json())
  .then(console.log);
```

应收到：

```json
{"type":"logCleared","processId":"Sum29PRU"}
```

## 相关路径

- SDK：[packages/procm-sdk/src/rest.ts](G:/procm-mcp/packages/procm-sdk/src/rest.ts)
- Dashboard 面板：[dashboard/src/components/LogPanel.tsx](G:/procm-mcp/dashboard/src/components/LogPanel.tsx)
- Dashboard WS：[dashboard/src/lib/ws.ts](G:/procm-mcp/dashboard/src/lib/ws.ts)
- 后端 WS：[src/websocket-server.ts](G:/procm-mcp/src/websocket-server.ts)
- 后端事件：[src/events.ts](G:/procm-mcp/src/events.ts)

## Suggested Skills

- `$diagnose`：继续排查端口 5176 的后端实例与 WS 代理是否指向同一服务。
- `$procm-mcp`：按 `debug.md` 使用全局 procm-mcp 重启和查看服务日志。
- `$procm-rooms`：若需继续扩展 SDK room/日志事件协议。

