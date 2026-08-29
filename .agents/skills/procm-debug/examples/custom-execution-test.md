# Custom Execution Test

此示例需要两个连接到同一 `roomId` 的 Node 进程：被测客户端暴露一个受信任的诊断函数，test 脚本调用它并收集日志。

## 被测客户端

被 procm 管理时可省略连接参数，SDK 会读取 `PROCM_ROOM_ID`、`PROCM_WS_URL` 和 `PROCM_PROCESS_ID`：

```ts
import {
  createProcmClient,
  exposeCustomExecution,
  setupLoggerFromEnv,
} from "@hunmer/procm-mcp-sdk";

const logger = setupLoggerFromEnv({ clientName: "orders-api" });
const client = createProcmClient({ clientName: "orders-api" });
const orders = new Map([["order-42", { state: "paid", total: 120 }]]);

await new Promise<void>((resolve) => {
  const off = client.onState((state) => {
    if (state === "open") { off(); resolve(); }
  });
});

const stopExecution = exposeCustomExecution(client, {
  target: "orders-api",
  context: { orders, logger },
});
logger.info("diagnostic execution enabled");

process.once("SIGINT", () => {
  stopExecution();
  client.close();
});
```

## test 脚本

独立运行时显式传入 WebSocket 地址和 room；`subscribeLogs` 捕获实时日志，`collectLogs` 在测试结束后读取托管进程的历史日志。

```ts
import assert from "node:assert/strict";
import {
  collectLogs,
  createProcmClient,
  executeCustom,
  subscribeLogs,
} from "@hunmer/procm-mcp-sdk";

const client = createProcmClient({
  url: process.env.PROCM_WS_URL ?? "ws://127.0.0.1:7331/room",
  roomId: process.env.PROCM_ROOM_ID ?? "checkout-debug",
  clientName: "orders-test",
});
await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("room connection timed out")), 5_000);
  const off = client.onState((state) => {
    if (state === "open") { clearTimeout(timer); off(); resolve(); }
  });
});

const liveLogs: string[] = [];
const stopLogs = subscribeLogs(client, (entry) => liveLogs.push(entry.message), {
  clientNames: ["orders-api"],
});

try {
  const order = await executeCustom(
    client,
    "orders-api",
    (ctx: {
      orders: Map<string, { state: string; total: number }>;
      logger: { info: (message: string, data?: Record<string, string | boolean>) => void };
    }, orderId) => {
      const order = ctx.orders.get(String(orderId)) ?? null;
      ctx.logger.info("diagnostic order inspected", { orderId, found: order !== null });
      return order;
    },
    ["order-42"],
    { timeout: 10_000 },
  );
  assert.deepEqual(order, { state: "paid", total: 120 });
  assert(liveLogs.includes("diagnostic order inspected"));

  const history = await collectLogs(client, { clientNames: ["orders-api"], count: 200 });
  assert(history.some((entry) => entry.message === "diagnostic execution enabled"));
  console.log("custom execution test passed");
} finally {
  stopLogs();
  client.close();
}
```

`executeCustom` 会把函数源码发送到目标端执行，因此只允许受信任的测试代码；始终指定 `timeout`，并在 `finally` 中取消订阅和关闭客户端。
