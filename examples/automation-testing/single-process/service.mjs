import {
  createLogger,
  createProcmClient,
  exposeCustomExecution,
} from "@hunmer/procm-mcp-sdk";

const client = createProcmClient({ clientName: "counter-service", reconnect: false });
const logger = createLogger({ client, clientName: "counter-service" });
const state = { value: 0, operations: 0 };
let stopExecution;

client.subscribe("counter:add", (message) => {
  const amount = Number(message.payload?.amount);
  state.value += amount;
  state.operations += 1;
  logger.info("counter updated", { amount, value: state.value });
  client.publish(
    "counter:result",
    { value: state.value, operations: state.operations },
    { correlationId: message.correlationId },
  );
});

client.onState((connectionState) => {
  if (connectionState !== "open") return;
  queueMicrotask(() => {
    stopExecution ??= exposeCustomExecution(client, {
      target: "counter-service",
      context: { snapshot: () => ({ ...state }) },
    });
    client.publish(
      "counter:ready",
      { pid: process.pid, initialValue: state.value },
      { retain: true },
    );
    logger.info("counter service ready", { pid: process.pid });
  });
});

function shutdown() {
  stopExecution?.();
  client.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
