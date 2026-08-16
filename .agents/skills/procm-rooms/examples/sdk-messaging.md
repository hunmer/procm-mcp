# SDK Messaging

Install and connect with explicit values in standalone scripts:

```ts
import { createProcmClient } from "@hunmer/procm-mcp-sdk";

const client = createProcmClient({
  url: "ws://127.0.0.1:7331/room",
  roomId: "checkout-debug",
  clientName: "trace-reader",
});

const unsubscribe = client.subscribe(
  "debug:",
  (message) => console.log(message.topic, message.memberId, message.payload),
  { prefix: true },
);

client.onState((state) => {
  if (state === "open") client.publish("debug:request", { traceId: "t-42" });
});

process.once("SIGINT", () => {
  unsubscribe();
  client.close();
});
```

For procm-managed processes, omit `url`, `roomId`, and `processId`; injected environment variables supply them. Explicit options take precedence.

See the real [Node server demo](../../../../demo/node-server/index.js) and [client implementation](../../../../packages/procm-sdk/src/client.ts).
