# Room And Batch Operations

Use the `room` MCP tool to inspect active members:

```json
{ "action": "get", "roomId": "checkout-debug" }
```

Update operator-facing metadata:

```json
{
  "action": "update",
  "roomId": "checkout-debug",
  "title": "Checkout debugging",
  "note": "Frontend, orders API, and trace reader"
}
```

Start several managed processes with bounded concurrency:

```json
{
  "action": "start",
  "concurrency": 2,
  "processes": [
    {
      "script": "npm",
      "args": ["start"],
      "cwd": "G:/work/api",
      "name": "api",
      "roomId": "checkout-debug"
    },
    {
      "script": "pnpm",
      "args": ["dev"],
      "cwd": "G:/work/client",
      "name": "client",
      "roomId": "checkout-debug"
    }
  ]
}
```

Use `action: "restart"` with `ids` for batch restart. Read every per-item `ok`/`error` result; the batch is best-effort and does not roll back successful items.

HTTP room metadata is available from `GET /api/rooms`, `GET /api/rooms/:roomId`, and `PATCH /api/rooms/:roomId`.

See [room tools](../../../../src/tools/room.ts) and [batch implementation](../../../../src/tools/process.ts).
