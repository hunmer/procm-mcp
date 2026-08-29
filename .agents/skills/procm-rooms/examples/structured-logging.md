# Structured Logging

For a Node.js or Electron application, use the one-call setup that also
captures `console.debug/info/log/warn/error/trace` and emits structured frames:

```ts
import { setupLogger } from "@hunmer/procm-mcp-sdk";

const logger = setupLogger({ clientName: "orders-api" });
logger.info("Order loaded", { orderId: 42, state: "paid" });
console.log("This is also emitted as an info-level structured entry");
```

For procm-managed Node processes, environment variables can configure the
client automatically:

```ts
import { setupLoggerFromEnv } from "@hunmer/procm-mcp-sdk";

const logger = setupLoggerFromEnv();
```

Use the lower-level API only when a custom console sink or capture behavior is
needed. Create a Logger next to the client with `createLogger`:

```ts
import { createLogger, createProcmClient } from "@hunmer/procm-mcp-sdk";

const client = createProcmClient({ clientName: "orders-api" });
const logger = createLogger({ client });

logger.debug("Cache lookup", { key: "order:42", hit: true });
logger.info("Order loaded", { orderId: 42, state: "paid" });
logger.warn("Payment retry scheduled", { retryInMs: 1500 });
logger.error("Synthetic failure", { code: "PAYMENT_TIMEOUT" });
```

Logger always writes readable stdout/stderr text. It appends a structured frame that procm parses into `level`, `memberId`, `clientName`, `message`, and optional `data`. When connected, it also publishes live entries on `$procm/log`. Use `onLog(entry)` when the host needs to mirror entries into an in-memory buffer or UI.

Query durable logs with the `room-logs` MCP tool:

```json
{
  "roomId": "checkout-debug",
  "memberPrefix": "orders",
  "level": "error",
  "count": 200
}
```

Or use HTTP:

```text
GET /api/rooms/checkout-debug/logs?memberPrefix=orders&level=error&count=200
```

Only existing process stdout/stderr files are durable. See [Logger source](../../../../packages/procm-sdk/src/logger.ts) and [room log merge](../../../../src/room-logs.ts).
