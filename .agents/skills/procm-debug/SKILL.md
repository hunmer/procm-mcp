---
name: procm-debug
description: 使用 procm-mcp room 与 @hunmer/procm-mcp-sdk 连接客户端、转发调试消息、记录并查询日志；高级模式支持 test 脚本向指定 room member 下发自定义执行指令并收集结果。Use when configuring PROCM_ROOM_ID/PROCM_WS_URL, createProcmClient, setupLogger, room/room-logs, executeCustom, exposeCustomExecution, or debugging through a shared room.
---

# Procm Debug

将 room 作为低侵入的调试总线。SDK 客户端连接 `/room`，Dashboard 仍使用独立的 `/ws`。

## 基础版：连接与日志转发

1. 为 procm 管理的进程配置 `roomId`；运行时会注入 `PROCM_ROOM_ID`、`PROCM_PROCESS_ID`、`PROCM_WS_URL`（以及可选 token）。独立脚本则显式传入 `url`、`roomId`、`clientName`。
2. 安装 `@hunmer/procm-mcp-sdk`，用 `createProcmClient` 建立连接，用 `publish`/`subscribe` 转发 JSON 调试消息。每个进程内的客户端使用不同 `clientName`。
3. 能输出到终端的调试消息可直接被 procm 捕获：Node/Electron 使用 `setupLogger`，或 procm 托管进程使用 `setupLoggerFromEnv`；它会保留可读 stdout/stderr，并附加可解析结构化帧。
4. 不会输出到终端的消息必须通过 SDK 的 `createLogger`/`logger.*` 发送；连接后日志也会实时发布到 `$procm/log`。历史日志使用 `room-logs`（仅适用于存在 stdout/stderr 文件的托管进程）。

最小连接示例见 [SDK messaging](examples/sdk-messaging.md)，日志示例见 [Structured logging](examples/structured-logging.md)。

## 高级版：test 脚本与自定义执行

适用于需要直接操作 room member 的测试/诊断脚本：

1. test 脚本作为独立 member 连接目标 `roomId`，等待 `open` 后调用 `executeCustom(client, target, fn, args, { timeout })`。
2. 目标客户端连接成功后调用 `exposeCustomExecution(client, { target, context })`；收到请求后在本地执行函数，并把 JSON 结果或错误回传给脚本。
3. 脚本用返回值断言业务状态；同时订阅 `$procm/log`（或 `debug:` 前缀）收集目标 member 的实时日志，必要时再调用 `room-logs` 拉取托管进程历史日志。
4. 自定义执行源码会在目标端 `eval`，只能对受信任的 test 脚本开放；target 使用明确的 member/client 名称，设置超时和 `AbortSignal`，不要把该能力暴露给浏览器或不可信用户。

```ts
import { createProcmClient, executeCustom } from "@hunmer/procm-mcp-sdk";

const client = createProcmClient({
  url: "ws://127.0.0.1:7331/room",
  roomId: "checkout-debug",
  clientName: "checkout-test",
});
await new Promise<void>((resolve) => {
  const off = client.onState((state) => {
    if (state === "open") { off(); resolve(); }
  });
});
const logs: unknown[] = [];
const unsubscribe = client.subscribe("$procm/log", (message) => logs.push(message.payload));
const value = await executeCustom(client, "orders-api", (ctx: { orders: { get: (id: string) => unknown } }, orderId) =>
  ctx.orders.get(orderId), ["order-42"], { timeout: 10_000 });
console.log(value);
unsubscribe();
client.close();
```

完整的双进程 test 示例见 [Custom execution test](examples/custom-execution-test.md)；room/MCP 操作见 [Room operations](examples/room-operations.md)，其余运行环境见 [Examples index](examples/index.md)。

## 约束

- `retain: true` 只用于当前状态（如 `backend:ready`）；重启 procm 后 retained 消息和成员状态会清空。
- `waitFor` 必须设置 `timeout` 或 `AbortSignal`，禁止无限等待。
- 浏览器代码不放 token；Electron 从 main 进程连接并通过窄 IPC 暴露能力。
- 第二个相同 member ID 的连接会替换第一个；不要依赖旧连接继续收消息。

## Source Of Truth

- SDK：`packages/procm-sdk/src/{index,client,protocol,logger,custom-execution}.ts`
- Room 工具：`src/tools/room.ts`；日志合并：`src/room-logs.ts`
- 批量进程：`src/tools/process.ts`
