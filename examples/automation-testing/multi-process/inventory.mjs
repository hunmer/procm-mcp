import {
  createLogger,
  createProcmClient,
  exposeCustomExecution,
} from "@hunmer/procm-mcp-sdk";

const client = createProcmClient({ clientName: "inventory", reconnect: false });
const logger = createLogger({ client, clientName: "inventory" });
const state = { stock: 10, reservations: 0 };
let stopExecution;

client.subscribe("inventory:reserve", (message) => {
  const quantity = Number(message.payload?.quantity);
  const accepted = Number.isFinite(quantity) && quantity > 0 && state.stock >= quantity;
  if (accepted) {
    state.stock -= quantity;
    state.reservations += 1;
  }
  logger.info("inventory reservation handled", { accepted, quantity, stock: state.stock });
  client.publish(
    "inventory:reserved",
    { accepted, quantity, stock: state.stock },
    { correlationId: message.correlationId },
  );
});

client.onState((connectionState) => {
  if (connectionState !== "open") return;
  queueMicrotask(() => {
    stopExecution ??= exposeCustomExecution(client, {
      target: "inventory",
      context: { snapshot: () => ({ ...state }) },
    });
    client.publish("inventory:ready", { stock: state.stock }, { retain: true });
    logger.info("inventory ready", { stock: state.stock });
  });
});

function shutdown() {
  stopExecution?.();
  client.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
