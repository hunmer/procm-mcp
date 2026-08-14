# Room Communication Findings And Decisions

## Requirements

- Publish a reusable TypeScript npm SDK that maintains a persistent WebSocket connection to procm.
- SDK clients can publish messages and subscribe to messages forwarded by procm within a room.
- A standalone TypeScript script can join a room and collect client debugging results without an agent invoking MCP log tools.
- SDK provides `waitFor` for workflows such as an Electron frontend waiting for backend initialization.
- A process has an optional `roomId`; restart must preserve and retransmit it.
- A room has a title, note, and process ID list.
- Add batch start and batch restart MCP tools.
- Query member logs by `roomId` plus a filter such as member prefix, merge them by timestamp, and do not create a second log database.
- Logger standardizes output so Dashboard can filter by level and render JSON payloads as collapsible objects.
- Logger falls back to readable normal output when procm is unavailable.
- Add `demo/node-server` and `demo/electron-client`; Electron needs a test UI.

## Repository Findings

- The root project is an ESM TypeScript npm package named `procm-mcp`, currently version `0.0.44`.
- The HTTP server already attaches a `ws` WebSocket server at `/ws`.
- Current WebSocket traffic is server-to-Dashboard only: process snapshots and log append events are broadcast; there is no client application protocol or room routing.
- WebSocket authentication supports either `?token=` or `bearer.<token>` subprotocol.
- Live process state is represented by `ProcessMetadata` in `src/types.ts`.
- Durable process records are stored in a global lowdb JSON file through `src/processes-repository.ts` and survive backend restarts.
- Process records already retain restart inputs including script, args, cwd, envs, description, port, and lifecycle/log paths.
- Public process views intentionally omit environment variables.
- MCP process tools are registered in `src/tools/process.ts`; existing start/restart manager functions should remain the single behavior source for batch tools.
- Dashboard code is a separate Vite/React TypeScript package under `dashboard/` and consumes `/ws` through `dashboard/src/lib/ws.ts`.
- `dashboard/src/components/LogPanel.tsx` is the requested structured log presentation surface.
- Existing test coverage is script-based under `tests/`, including lifecycle, logs, HTTP API, MCP HTTP, CLI, and a live WebSocket check.
- Root TypeScript currently compiles only `src/**/*` into `build`, so the SDK should be a separate package with its own build rather than forcing it under the server rootDir.
- Dashboard already has reconnect logic for `/ws` and typed `processes`/`log` messages; compatibility can be retained by keeping `/ws` for Dashboard and adding `/room` for SDK clients.
- Existing `LogEntry` is `{ timestamp, stream, message }`; structured fields can be optional additions so legacy lines need no conversion.
- Current start-process MCP schema exposes script/name/args/cwd/envs/desc but not port or roomId; both need schema parity with the HTTP start surface.
- `startProcess` is the central spawn/log-client construction point and `restartProcess` handles both live and persisted records, so room propagation can remain narrowly scoped to these signatures plus record mapping.
- Existing on-disk process log lines do not include timestamps; new writes must add `[ISO]` prefixes for deterministic historical merging while legacy files remain supported.
- `npm pack --dry-run` for `@procm-mcp/sdk` succeeds and includes only package metadata plus compiled JS, declarations, maps, and sources.
- COSS guidance recommends a visible grouped control for the short level set; Dashboard keeps its existing badge-style compact controls but changes them to actual structured-level filtering.
- Electron demo dependency management must use pnpm; its partial npm install was stopped and replaced rather than mixed with a second package manager.
- Dashboard log parsing already merges stdout/stderr by timestamp; optional structured fields can be decoded in `parseLogText` and passed through live WebSocket messages.
- Use a dedicated `/room` WebSocket path handled by the existing upgrade listener; installing a second independent upgrade listener would conflict because the current handler destroys unknown paths.

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Use a versioned discriminated JSON protocol | Allows runtime validation, compatible evolution, and clear routing. |
| Keep latest retained message per room/topic only in memory | Eliminates the `waitFor` subscribe-after-ready race without persistent history. |
| `waitFor` checks retained state before registering for future messages | Ensures backend initialization can complete before the frontend begins waiting. |
| Auto-inject room/process/server/auth settings into managed child environments | Gives managed applications zero-config SDK connection behavior. |
| SDK explicit options override injected settings | Standalone scripts must connect to arbitrary rooms. |
| Use stable member ID plus per-socket connection ID | Supports reconnect, process restart, presence, and stale socket replacement. |
| Replace an existing connection with the same member ID | Guarantees one active subscriber set per logical member. |
| Write structured Logger frames through stdout/stderr | Existing process log files stay the durable source; no duplicate DB is needed. |
| Treat non-frame output as legacy plain logs | Preserves compatibility with all existing processes and tools. |
| Merge room logs at query time using parsed timestamps | Meets cross-member ordering without duplicating storage. |
| Use bounded concurrency and per-item results for batch tools | Prevents resource spikes and makes partial failure explicit. |

## Risks To Address During Implementation

- Browser/Electron renderer authentication cannot safely rely on arbitrary headers or leaked environment secrets.
- A marker-based structured line format must resist accidental collisions with ordinary application output.
- Historical room log lookup needs a durable association from room to process records after processes stop.
- Multiple log files may contain equal timestamps; deterministic tie-breaking is required.
- Parsing and merging whole unbounded files would be expensive; query limits and pagination/tailing strategy are required.
- Existing `/ws` Dashboard clients must not be forced onto the SDK protocol without a compatibility path.
- Replacing member sockets must ensure the old socket cannot later emit a misleading leave event for the new connection.
- Persisted legacy process records will not contain `roomId` and must deserialize as unassigned.
- Injected authentication must never be returned by process APIs or Logger metadata.

## Resources

- `src/websocket-server.ts`: existing Dashboard WebSocket and auth behavior.
- `src/process-manager.ts`: process lifecycle, restart, persistence, and log files.
- `src/processes-repository.ts`: durable process record schema.
- `src/types.ts`: live process model.
- `src/tools/process.ts`: MCP start/restart tools.
- `src/http-server.ts`: public process views and HTTP surface.
- `dashboard/src/lib/ws.ts`: Dashboard socket consumer.
- `dashboard/src/components/LogPanel.tsx`: structured log UI target.
- `tests/`: current compatibility and integration checks.

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Initial planning-file check used invalid PowerShell interpolation | Retried with `${file}` and recorded the error in planning files. |
