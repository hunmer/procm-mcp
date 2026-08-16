---
name: procm-rooms
description: Use procm-mcp rooms and @hunmer/procm-mcp-sdk to connect Node.js, Electron, browser-capable, and diagnostic TypeScript clients over WebSocket; coordinate startup with retained waitFor signals; publish and subscribe to typed topics; emit structured logs; query merged room logs; inspect room members; and batch start or restart managed processes. Trigger when building, integrating, debugging, or documenting applications that use roomId, PROCM_ROOM_ID, /room, createProcmClient, Logger, waitFor, room/room-logs MCP tools, or batch-process.
---

# Procm Rooms

Use the room architecture as a low-intrusion application message bus and debugging channel. Keep the Dashboard `/ws` channel separate from SDK clients on `/room`.

## Choose The Workflow

- Connect application processes or a diagnostic script: read [SDK messaging](examples/sdk-messaging.md).
- Coordinate frontend/backend initialization without polling: read [Retained readiness](examples/retained-readiness.md).
- Produce Dashboard-friendly logs and query them across members: read [Structured logging](examples/structured-logging.md).
- Inspect/update rooms or batch process operations through MCP/HTTP: read [Room operations](examples/room-operations.md).
- Integrate Electron without exposing Node APIs to the renderer: read [Electron integration](examples/electron-integration.md).
- Browse all examples from [Examples index](examples/index.md).

## Architecture Capabilities

1. Route exact or prefix topics between active clients in one `roomId`.
2. Let standalone TypeScript scripts subscribe to debugging results without calling MCP log tools.
3. Retain only the latest explicitly retained message per room/topic in memory so `waitFor` handles late subscribers.
4. Preserve a managed process's optional `roomId` across restart and inject `PROCM_ROOM_ID`, `PROCM_PROCESS_ID`, `PROCM_WS_URL`, and optional token automatically.
5. Keep one active socket per logical member while assigning a new connection ID after reconnect.
6. Write parseable Logger frames into the existing stdout/stderr files while retaining readable console output.
7. Merge historical room logs by timestamp with member-prefix and level filters, without creating a log database.
8. Expose room metadata/members through `room`, historical entries through `room-logs`, and bounded best-effort process batches through `batch-process`.

## Operating Rules

- Use `retain: true` only for current state such as `backend:ready`; ordinary message history is not persisted.
- Expect retained values and live membership to reset when the procm backend restarts.
- Give each client in the same process a distinct `clientName`; `processId + clientName` is its stable logical identity.
- Treat a second socket with the same member ID as a replacement for the first.
- Use `waitFor` with `timeout` or `AbortSignal`; do not create unbounded initialization waits.
- Use `Logger` for structured data. Keep arbitrary application stdout compatible as plain legacy logs.
- Query historical room logs only for procm-managed processes whose log files exist. External SDK-only clients have live messaging but no durable procm log file.
- Pass explicit SDK options to override injected environment configuration in standalone scripts.
- Keep authentication out of browser-visible code. In Electron, connect from main and expose narrow preload IPC methods.

## Source Of Truth

- SDK exports: [packages/procm-sdk/src/index.ts](../../../packages/procm-sdk/src/index.ts)
- Protocol: [packages/procm-sdk/src/protocol.ts](../../../packages/procm-sdk/src/protocol.ts)
- Client: [packages/procm-sdk/src/client.ts](../../../packages/procm-sdk/src/client.ts)
- Logger: [packages/procm-sdk/src/logger.ts](../../../packages/procm-sdk/src/logger.ts)
- Room tools: [src/tools/room.ts](../../../src/tools/room.ts)
- Batch tool: [src/tools/process.ts](../../../src/tools/process.ts)
- Working demos: [demo/README.md](../../../demo/README.md)
