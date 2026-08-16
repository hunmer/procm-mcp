# 架构总览

`@hunmer/procm-mcp-sdk` 是 procm-mcp 房间系统的 TypeScript 客户端 SDK，独立发布到 npm。被管理进程（由 `start-process` 启动、环境变量里自动拿到 `PROCM_ROOM_ID`/`PROCM_WS_URL` 等）或任意 WebSocket 客户端用它接入后端的 `/room` 端点。

## 四块能力

1. **房间消息**（`client.ts`）：`ProcmClient` — WebSocket 连接、hello 握手、精确/prefix 订阅、retain 发布、`waitFor` 一次性等待、成员/连接状态事件、自动重连。
2. **结构化日志**（`logger.ts` + `protocol.ts`）：`createLogger` 双写 console 与 `$procm/log` topic；日志行内嵌 base64url marker（`@@PROCM_LOG_V1@@`），后端 `room-logs.ts` 靠它从进程 stdout 还原结构化条目。
3. **函数追踪**（`hook.ts` + `trace.ts`）：`createHook`/`hookProperty` 拦截函数调用生成 `FunctionTrace`（调用链/参数/结果/异常），`saveTrace` 经 `trace:put` 帧存入后端内存 LRU；LLM 侧用 `trace-get` 工具读取。
4. **自定义远程执行**（`custom-execution.ts`）：`exposeCustomExecution`/`executeCustom` 经 `$procm/custom-execution/request|result` topic 做 RPC——调用方把函数**源码字符串**发给目标端求值。

## 运行形态

- 纯库，无入口进程、无 CLI。浏览器与 Node 通用：默认用全局 `WebSocket`，Node 无原生 WebSocket 时注入 `webSocketFactory`（demo 里用 `ws` 包）。
- `Logger` 在无 client / 未连接时退化为纯 console 输出（standalone 模式），始终可用。
- 协议版本常量 `PROCM_PROTOCOL_VERSION = 1`，收发帧都严格校验版本与字段，坏帧静默丢弃。

## 关键设计取舍

- **零重依赖**：运行时依赖仅 `callsites`（hook 取调用链）。token、URL、roomId 全部可从环境变量自动发现，托管进程零配置接入。
- **trace 存后端内存**（LRU 64 MiB / 单条 256 KiB / TTL 1s~7d），刻意 ephemeral：重启即清、跨实例不共享；`saveTrace` 显式确认写入完成才 resolve。
- **`custom-execution` 用 `eval` 在目标端求值**——等价于把代码执行权交给 room 内任意成员，只能用于完全信任的本地环境。
- 重连指数退避（0.5s 起步、上限 10s、带 20%±jitter），20s 心跳保活；`waitFor`/trace 请求在断连时统一 reject，不泄漏挂起 Promise。
