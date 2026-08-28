import {
  createLogger,
  createProcmClient,
  exposeCustomExecution,
} from "@hunmer/procm-mcp-sdk";

const client = createProcmClient({ clientName: "order-worker", reconnect: false });
const logger = createLogger({ client, clientName: "order-worker" });
const pendingOrders = new Map();
const state = { processed: 0, lastOrderId: null };
let stopExecution;

client.subscribe("order:submit", (message) => {
  const correlationId = message.correlationId;
  if (!correlationId) return;
  pendingOrders.set(correlationId, message.payload?.orderId);
  logger.info("order received", { orderId: message.payload?.orderId, quantity: message.payload?.quantity });
  client.publish(
    "inventory:reserve",
    { quantity: message.payload?.quantity },
    { correlationId },
  );
});

client.subscribe("inventory:reserved", (message) => {
  const correlationId = message.correlationId;
  if (!correlationId || !pendingOrders.has(correlationId)) return;
  const orderId = pendingOrders.get(correlationId);
  pendingOrders.delete(correlationId);
  if (message.payload?.accepted) {
    state.processed += 1;
    state.lastOrderId = orderId;
  }
  logger.info("order completed", { orderId, accepted: message.payload?.accepted });
  client.publish(
    "order:completed",
    { orderId, accepted: message.payload?.accepted, remainingStock: message.payload?.stock },
    { correlationId },
  );
});

async function main() {
  await waitOpen();
  const inventory = await client.waitFor("inventory:ready", { timeout: 10_000 });
  stopExecution = exposeCustomExecution(client, {
    target: "order-worker",
    context: { snapshot: () => ({ ...state, pending: pendingOrders.size }) },
  });
  client.publish("worker:ready", { inventoryStock: inventory.payload?.stock }, { retain: true });
  logger.info("order worker ready", { inventoryStock: inventory.payload?.stock });
}

function waitOpen() {
  if (client.connectionState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("worker SDK connection timeout")), 5_000);
    const off = client.onState((stateValue) => {
      if (stateValue !== "open") return;
      clearTimeout(timer);
      off();
      resolve();
    });
  });
}

function shutdown() {
  stopExecution?.();
  client.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
main().catch((error) => {
  logger.error("order worker failed to initialize", { error: error.message });
  shutdown();
  process.exitCode = 1;
});
