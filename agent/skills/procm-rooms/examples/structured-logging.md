# Structured Logging

Create a Logger next to the client:

```ts
import { createLogger, createProcmClient } from "@procm-mcp/sdk";

const client = createProcmClient({ clientName: "orders-api" });
const logger = createLogger({ client });

logger.debug("Cache lookup", { key: "order:42", hit: true });
logger.info("Order loaded", { orderId: 42, state: "paid" });
logger.warn("Payment retry scheduled", { retryInMs: 1500 });
logger.error("Synthetic failure", { code: "PAYMENT_TIMEOUT" });
```

Logger always writes readable stdout/stderr text. It appends a structured frame that procm parses into `level`, `memberId`, `clientName`, `message`, and optional `data`. When connected, it also publishes live entries on `$procm/log`.

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
