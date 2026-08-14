# Retained Readiness

Publish current readiness state from the backend:

```ts
client.onState((state) => {
  if (state === "open") {
    client.publish(
      "backend:ready",
      { initializedAt: Date.now(), port: 4310 },
      { retain: true },
    );
  }
});
```

Wait from a frontend or orchestration script:

```ts
const ready = await client.waitFor("backend:ready", {
  timeout: 30_000,
  filter: (payload) => typeof payload === "object" && payload !== null,
});

console.log("Backend ready", ready.payload);
```

Use an `AbortSignal` when the surrounding workflow already owns cancellation:

```ts
await client.waitFor("migration:complete", {
  signal: abortController.signal,
});
```

Retained values are latest-state memory, not durable message history. They disappear when procm restarts.

See [client waitFor](../../../../packages/procm-sdk/src/client.ts) and the [Node demo](../../../../demo/node-server/index.js).
