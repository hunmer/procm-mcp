import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  collectLogs,
  createProcmClient,
  executeCustom,
} from "@hunmer/procm-mcp-sdk";
import {
  randomPort,
  startBackend,
  stopBackend,
} from "../../../tests/_helpers.mjs";
import {
  assertExample,
  createReporter,
  deleteManagedProcess,
  printProcessDiagnostics,
  projectRoot,
  startManagedProcess,
  waitForValue,
  waitOpen,
} from "../_shared.mjs";

const reporter = createReporter("多进程联合自动化调试示例", 6);
const port = randomPort();
const roomId = `multi-example-${randomUUID()}`;
const startedAt = Date.now();
const processIds = [];
let backend;
let controller;

try {
  backend = await startBackend({ port });
  controller = createProcmClient({
    url: `ws://127.0.0.1:${port}/room`,
    roomId,
    clientName: "multi-test-driver",
    reconnect: false,
  });
  await waitOpen(controller);
  reporter.pass("隔离后端与联合测试驱动已连接", { port, roomId });

  const inventoryReady = controller.waitFor("inventory:ready", { timeout: 8_000 });
  const workerReady = controller.waitFor("worker:ready", { timeout: 8_000 });
  const starts = await Promise.all([
    startManagedProcess(port, {
      script: "node",
      args: [resolve(projectRoot, "examples/automation-testing/multi-process/inventory.mjs")],
      cwd: projectRoot,
      name: "example-inventory",
      roomId,
      group: "example",
    }),
    startManagedProcess(port, {
      script: "node",
      args: [resolve(projectRoot, "examples/automation-testing/multi-process/worker.mjs")],
      cwd: projectRoot,
      name: "example-order-worker",
      roomId,
      group: "example",
    }),
  ]);
  processIds.push(...starts.map((process) => process.id));
  reporter.pass("两个业务进程已并发启动", {
    processes: starts.map((process) => ({ id: process.id, name: process.name })),
  });

  const [inventoryState, workerState] = await Promise.all([inventoryReady, workerReady]);
  assertExample(inventoryState.payload?.stock === 10, "inventory readiness mismatch", inventoryState.payload);
  assertExample(workerState.payload?.inventoryStock === 10, "worker readiness mismatch", workerState.payload);
  reporter.pass("跨进程 retained readiness 验证通过", {
    inventory: inventoryState.payload,
    worker: workerState.payload,
  });

  const correlationId = randomUUID();
  const completionPromise = controller.waitFor("order:completed", {
    timeout: 5_000,
    filter: (_payload, message) => message.correlationId === correlationId,
  });
  controller.publish(
    "order:submit",
    { orderId: "ORDER-1001", quantity: 2 },
    { correlationId },
  );
  const completion = await completionPromise;
  assertExample(
    completion.payload?.accepted === true && completion.payload?.remainingStock === 8,
    "order completion mismatch",
    completion.payload,
  );
  reporter.pass("worker -> inventory -> worker 联合流程验证通过", {
    correlationId,
    result: completion.payload,
  });

  const [inventorySnapshot, workerSnapshot] = await Promise.all([
    executeCustom(controller, "inventory", (context) => context.snapshot()),
    executeCustom(controller, "order-worker", (context) => context.snapshot()),
  ]);
  assertExample(inventorySnapshot.stock === 8 && inventorySnapshot.reservations === 1, "inventory snapshot mismatch", inventorySnapshot);
  assertExample(workerSnapshot.processed === 1 && workerSnapshot.pending === 0, "worker snapshot mismatch", workerSnapshot);
  reporter.pass("两个进程的状态快照验证通过", {
    inventory: inventorySnapshot,
    worker: workerSnapshot,
  });

  const logs = await waitForValue(
    () => collectLogs(controller, { startTime: startedAt, count: 200 }),
    (entries) => {
      const messages = new Set(entries.map((entry) => `${entry.clientName}:${entry.message}`));
      return messages.has("inventory:inventory reservation handled") && messages.has("order-worker:order completed");
    },
  );
  const evidence = logs
    .filter((entry) => ["inventory reservation handled", "order completed"].includes(entry.message))
    .map((entry) => ({ clientName: entry.clientName, message: entry.message, data: entry.data }));
  reporter.pass("跨进程结构化日志聚合验证通过", evidence);

  reporter.done();
} catch (error) {
  reporter.fail(error);
  await printProcessDiagnostics(port, processIds);
  process.exitCode = 1;
} finally {
  let cleanupFailed = false;
  for (const id of processIds) {
    try {
      await deleteManagedProcess(port, id);
    } catch (error) {
      cleanupFailed = true;
      console.error(`[CLEANUP] FAIL | ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  controller?.close();
  stopBackend(backend);
  if (!cleanupFailed) {
    console.log("[CLEANUP] PASS | 两个业务进程、SDK 客户端和隔离后端已释放");
  } else {
    process.exitCode = 1;
  }
}
