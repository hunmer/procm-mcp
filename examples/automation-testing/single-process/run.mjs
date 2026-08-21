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

const reporter = createReporter("单进程自动化调试示例", 6);
const port = randomPort();
const roomId = `single-example-${randomUUID()}`;
const startedAt = Date.now();
let backend;
let controller;
let processId;

try {
  backend = await startBackend({ port });
  controller = createProcmClient({
    url: `ws://127.0.0.1:${port}/room`,
    roomId,
    clientName: "single-test-driver",
    reconnect: false,
  });
  await waitOpen(controller);
  reporter.pass("隔离后端与测试驱动已连接", { port, roomId });

  const readyPromise = controller.waitFor("counter:ready", { timeout: 5_000 });
  const target = await startManagedProcess(port, {
    script: "node",
    args: [resolve(projectRoot, "examples/automation-testing/single-process/service.mjs")],
    cwd: projectRoot,
    name: "example-counter-service",
    roomId,
    group: "example",
  });
  processId = target.id;
  reporter.pass("被测进程已由 procm 托管", { processId });

  const ready = await readyPromise;
  assertExample(ready.payload?.initialValue === 0, "unexpected readiness payload", ready.payload);
  reporter.pass("retained readiness 验证通过", ready.payload);

  const correlationId = randomUUID();
  const resultPromise = controller.waitFor("counter:result", {
    timeout: 5_000,
    filter: (_payload, message) => message.correlationId === correlationId,
  });
  controller.publish("counter:add", { amount: 7 }, { correlationId });
  const result = await resultPromise;
  assertExample(result.payload?.value === 7, "counter result mismatch", result.payload);
  reporter.pass("业务消息与 correlationId 验证通过", {
    correlationId,
    result: result.payload,
  });

  const snapshot = await executeCustom(
    controller,
    "counter-service",
    (context) => context.snapshot(),
  );
  assertExample(snapshot.value === 7 && snapshot.operations === 1, "state snapshot mismatch", snapshot);
  reporter.pass("executeCustom 状态快照验证通过", snapshot);

  const logs = await waitForValue(
    () => collectLogs(controller, { startTime: startedAt, count: 100 }),
    (entries) => entries.some((entry) => entry.clientName === "counter-service" && entry.message === "counter updated"),
  );
  const counterLog = logs.find((entry) => entry.clientName === "counter-service" && entry.message === "counter updated");
  reporter.pass("结构化日志回收验证通过", {
    level: counterLog.level,
    message: counterLog.message,
    data: counterLog.data,
  });

  reporter.done();
} catch (error) {
  reporter.fail(error);
  await printProcessDiagnostics(port, [processId]);
  process.exitCode = 1;
} finally {
  try {
    await deleteManagedProcess(port, processId);
    controller?.close();
    stopBackend(backend);
    console.log("[CLEANUP] PASS | 被测进程、SDK 客户端和隔离后端已释放");
  } catch (error) {
    console.error(`[CLEANUP] FAIL | ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
