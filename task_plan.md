# procm-mcp Room Communication Implementation Plan

## Goal

Add a reusable TypeScript SDK and room-based WebSocket communication to procm-mcp, carry optional room identity through managed process restarts, provide batch start/restart tools, expose structured and filterable logs without a second log database, and prove the workflow with Node.js and Electron demo projects.

## Current Phase

Complete. All ten implementation and documentation phases have been verified.

## Success Criteria

- Other TypeScript projects can install and import the SDK as a normal npm package.
- SDK clients maintain a reconnecting WebSocket connection, publish/subscribe room messages, and use race-free `waitFor` retained-state semantics.
- Managed processes accept an optional `roomId`; restart preserves it and procm injects SDK connection environment variables.
- Room metadata includes title, note, and associated process IDs; active members and retained messages are available at runtime.
- A script can join a room and subscribe to messages/logs without invoking MCP log tools.
- Logs can be queried by `roomId` and member filter/prefix, merged in timestamp order from existing log files, with no second log database.
- Logger output remains human-readable when procm is absent and is losslessly parseable when captured by procm.
- Dashboard LogPanel filters by level and renders JSON payloads as collapsible structured objects.
- Batch start/restart tools return per-item results and do not hide partial failures.
- `demo/` contains a working Node.js backend and Electron client using the SDK, with a test UI demonstrating presence, messages, `waitFor`, and structured logs.
- Existing lifecycle, HTTP, MCP, CLI, log, and WebSocket behavior remains compatible.

## Implementation Phases

### Phase 10: Procm Rooms Skill Documentation

- [x] Initialize `agent/skills/procm-rooms` with official skill tooling.
- [x] Describe the architecture capability map and operating constraints.
- [x] Add linked Markdown examples for SDK messaging, waitFor, logging, room operations, batch operations, and Electron.
- [x] Generate matching `agents/openai.yaml` metadata.
- [x] Validate frontmatter, naming, and all local Markdown links.
- **Status:** complete

### Phase 1: Protocol Contract And Package Layout

- [ ] Define versioned client/server message envelopes and runtime validators.
- [ ] Define room, member, message, retained-message, and structured-log public types.
- [ ] Reserve protocol fields: `version`, `type`, `roomId`, `memberId`, `connectionId`, `topic`, `timestamp`, `messageId`, `payload`, and `retain`.
- [ ] Define prefix subscription and server-side filtering semantics.
- [ ] Define stable member identity as `processId + clientName`; use a unique `connectionId` per socket and replace an older connection for the same member.
- [ ] Decide package layout after checking the current publish pipeline: either a workspace package such as `packages/procm-sdk` or a separately exported package directory.
- [ ] Ensure protocol types used by both server and SDK have one source of truth.
- **Exit:** TypeScript builds the shared contract and protocol tests cover valid, invalid, and version-mismatch messages.
- **Status:** complete

### Phase 2: TypeScript SDK

- [ ] Implement `createProcmClient()` with explicit options overriding `PROCM_ROOM_ID`, `PROCM_PROCESS_ID`, `PROCM_WS_URL`, and auth environment variables.
- [ ] Implement connection states, heartbeat, exponential reconnect with jitter, subscription replay, and clean disposal.
- [ ] Implement `publish`, exact/prefix `subscribe`, member presence events, and typed event handlers.
- [ ] Implement retained publish and `waitFor(topic, { filter, timeout, signal })`; check retained state before waiting for new messages.
- [ ] Implement stable member metadata and reconnection behavior.
- [ ] Implement `Logger` levels and structured JSON payload support while retaining readable console fallback.
- [ ] Avoid browser secrets and Node-only APIs in the browser entry; provide safe Electron main/preload usage.
- [ ] Export ESM types and runtime code with package metadata suitable for local demo consumption and npm publishing.
- **Exit:** Unit tests cover reconnect, subscription replay, retained `waitFor`, timeout/cancel, member replacement, logger encoding, and console fallback.
- **Status:** complete

### Phase 3: Room Runtime In procm-mcp

- [ ] Split the existing dashboard-only `/ws` handling into explicit endpoints or protocol roles so existing Dashboard behavior remains compatible.
- [ ] Add authenticated SDK handshake and validate room/member identity before accepting application messages.
- [ ] Add an in-memory room registry containing metadata, active connections, subscriptions, and the latest retained message per topic.
- [ ] Forward client messages only to matching subscribers in the same room.
- [ ] Implement single-active-connection replacement for a logical member.
- [ ] Emit join, leave, replacement, and room update events to interested clients and Dashboard consumers.
- [ ] Apply payload-size, rate, malformed-message, heartbeat, and slow-consumer protections.
- [ ] Persist room metadata and process associations, but not ordinary or retained message history.
- [ ] Add room read/update/list surfaces needed by MCP, HTTP, and Dashboard.
- **Exit:** Integration tests prove isolation between rooms, prefix matching, forwarding, retained-state lookup, reconnect, auth rejection, and cleanup.
- **Status:** complete

### Phase 4: Process Model And Environment Injection

- [ ] Add optional `roomId` to live process metadata, durable process records, public API views, MCP schemas, HTTP schemas, CLI paths where applicable, and Dashboard types.
- [ ] Preserve backward compatibility when old `processes.json` records omit `roomId`.
- [ ] Extend `startProcess` to inject SDK environment variables without persisting or exposing secrets in public process views.
- [ ] Preserve the existing `roomId` and regenerate correct connection variables during restart.
- [ ] Keep room `processIds` synchronized on start, restart, stop/delete, stale-process reconciliation, and legacy-record loading.
- [ ] Add focused repository and lifecycle tests for room propagation.
- **Exit:** Starting and restarting a managed process requires no SDK connection configuration in application code and rejoins the same room.
- **Status:** complete

### Phase 5: Batch Start And Restart Tools

- [ ] Add batch input schemas that reuse single-process start/restart validation instead of duplicating behavior.
- [ ] Define deterministic result order and per-item discriminated results (`ok`, process data, or error).
- [ ] Execute with a bounded concurrency limit to avoid process and port spikes.
- [ ] Treat batches as best-effort: one item failure does not roll back or suppress other results.
- [ ] Add MCP registration, HTTP parity only if the existing architecture expects tool/API parity, and concise tool logging.
- [ ] Test mixed success/failure, duplicate IDs, empty/oversized batches, room propagation, and restart of historical records.
- **Exit:** Agents can start or restart multiple processes in one tool call and identify every partial failure.
- **Status:** complete

### Phase 6: Structured Log Pipeline And Query

- [ ] Define a collision-resistant single-line log frame with schema version, timestamp, level, member identity, text, and optional JSON payload.
- [ ] Make Logger write the framed line to normal stdout/stderr so existing process log files remain the only durable log store.
- [ ] Parse valid frames while preserving arbitrary unstructured output as plain log entries.
- [ ] Keep stdout/stderr compatibility and never expose injected auth values.
- [ ] Implement room log lookup by resolving the room's process IDs to existing log files, filtering member identity/prefix, and performing a timestamp-ordered merge.
- [ ] Define stable ordering for equal timestamps and bounded query limits/pagination to avoid loading unbounded files.
- [ ] Expose the query through the appropriate MCP/HTTP surfaces and stream live structured logs over WebSocket.
- [ ] Test malformed frames, multiline/large JSON values, ANSI text, mixed legacy output, equal timestamps, rotations/missing files, and prefix filters.
- **Exit:** Historical room logs come only from existing log files, live and historical results share one entry shape, and ordering/filtering is deterministic.
- **Status:** complete

### Phase 7: Dashboard LogPanel

- [ ] Extend Dashboard types and WebSocket handling for normalized structured log entries.
- [ ] Add level filtering without regressing current stdout/stderr and grep behavior.
- [ ] Render JSON payloads with an accessible collapsible tree/object view and a readable raw fallback.
- [ ] Add room/member filters and keep large log lists responsive.
- [ ] Preserve rendering for legacy plain-text lines and ANSI content.
- [ ] Add component tests where supported and verify desktop/mobile layout manually only if requested.
- **Exit:** Users can filter levels/members and inspect JSON payloads without losing plain log compatibility.
- **Status:** complete

### Phase 8: Node.js And Electron Demo

- [ ] Create `demo/node-server` using the local SDK package; publish retained `backend:ready`, respond to messages, and emit logs at multiple levels with JSON payloads.
- [ ] Create `demo/electron-client` with main, secure preload, and renderer boundaries.
- [ ] Add an Electron test UI for connection/member state, backend readiness via `waitFor`, sending messages, viewing replies, triggering log samples, and reconnect testing.
- [ ] Keep demo scripts Windows-friendly and document the shortest run sequence.
- [ ] Use local package references/workspaces so demo validation exercises the same SDK artifact intended for npm consumers.
- **Exit:** One command (or a documented minimal command sequence) starts the demo and visibly proves the complete workflow.
- **Status:** complete

### Phase 9: Integration, Compatibility, And Release Readiness

- [ ] Run TypeScript builds for root, SDK, Dashboard, and both demos.
- [ ] Run all existing tests plus new protocol, SDK, room, batch, logging, and demo smoke tests.
- [ ] Start/restart the persistent procm service through procm-mcp after code changes, per repository instructions.
- [ ] Verify process restart preserves `roomId`, SDK reconnects, `waitFor` handles already-ready backend state, and log query merges multiple members correctly.
- [ ] Verify old records and unstructured logs remain readable.
- [ ] Review package exports/files and perform a local `npm pack` consumer test before publishing.
- [ ] Update README and relevant architecture/public-interface documentation.
- **Exit:** All automated checks pass and the demo satisfies every success criterion.
- **Status:** complete

## Agreed Decisions

| Decision | Rationale |
|----------|-----------|
| procm is a bidirectional room message broker | Enables direct diagnostic scripts and avoids requiring an agent to call MCP for logs. |
| Ordinary message history is not persisted | It is not currently required and avoids a new message database. |
| Retained state is in memory, latest value per room/topic | Makes `waitFor` race-free without creating persistent history. |
| `waitFor` supports filter, timeout, and `AbortSignal` | Covers initialization gating and safe cancellation. |
| Managed processes receive SDK settings through environment variables | Provides minimum-intrusion integration and automatic restart behavior. |
| Explicit SDK configuration overrides environment variables | Supports standalone diagnostic scripts and tests. |
| Member identity is stable while connection identity is ephemeral | Prevents duplicate members across reconnects while allowing stale socket replacement. |
| One active connection per logical member | Avoids duplicated subscriptions and ambiguous presence. |
| Existing process log files are the only durable log source | Satisfies structured historical queries without a second log database. |
| Batch operations are bounded-concurrency best effort | Partial success is observable and one bad process does not block the batch. |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| PowerShell parsed `$file:` as an invalid variable reference while checking planning files | 1 | Changed interpolation to `${file}` and confirmed all planning files were absent. |
| Combined roomId patch missed the exact `Set<string>` line in `deleteProcesses` | 1 | No partial edit was applied; split the change into smaller exact patches. |
| Parallel demo npm install timed out while Electron postinstall was still running | 1 | Verified Node install completed and monitored the existing Electron installer instead of launching a conflicting second install. |
| CLI `stop` left a durable record despite its documented delete semantics | 1 | Changed only the CLI call to use DELETE; retained Dashboard stop behavior. |
| A procm-managed procm backend killed itself during stale reconciliation after restart | 1 | Skip durable records whose PID equals the current backend PID. |
| A foreground diagnostic backend survived command timeout and occupied port 7331 | 1 | Verified and stopped only that PID, then matched listener/API/record PIDs after restart. |

## Scope Guardrails

- Do not persist arbitrary room message history or retained state.
- Do not add a second database for structured logs.
- Do not break the current Dashboard WebSocket snapshot/log stream.
- Do not expose process environment variables or WebSocket auth credentials through public APIs or logs.
- Do not make batch operations transactional unless a later requirement explicitly demands rollback.
- Ask the user only if implementation discovers a direct conflict with the success criteria above.
