## Add an optional "port" field + one-click open badge

### Why this is full-stack (not just the 2 named files)
The card reads everything from `ProcessView`, which is served entirely by the backend (REST `GET /api/processes` + the WebSocket broadcast). For the port to reliably belong to the right process across reloads/restarts — exactly like the existing optional `desc` field — it must be persisted in the process record. So the port is threaded through the same path `desc` already uses. I'm matching the established convention rather than introducing a fragile client-only (localStorage) hack.

### Backend (`src/`)
1. **`src/types.ts`** — `ProcessMetadata`: add `port: number | null`.
2. **`src/processes-repository.ts`** — `ProcessRecord`: add `port?: number | null` (optional so old JSON records load fine).
3. **`src/process-manager.ts`**
   - `startProcess(...)`: add a trailing optional `port?: number | null` param (keeps the existing positional style; the 2 MCP-tool callers stay valid unchanged). Assign it onto the created metadata.
   - `toRecord()`: include `port`.
   - `restartProcess` and the revive branch: pass the existing `port` through so a restart/revive keeps it.
4. **`src/http-server.ts`**
   - `toPublicView` and `toPublicRecord`: include `port`.
   - `POST /api/processes` handler: read `body.port`, validate it's an integer in 1–65535 (else ignore/400), pass to `startProcess`.
5. **`src/websocket-server.ts`** — its local `toPublicView`: include `port` (the 3rd emit site).

### Frontend (`dashboard/src/`)
6. **`lib/types.ts`** — `ProcessView`: add `port?: number | null`; `StartProcessBody`: add `port?: number`.
7. **`components/NewProcessDialog.tsx`**
   - `NewProcessDialog`: add `port` state; send it in `startProcess`; reset on submit.
   - Shared `ProcessForm`: add an optional port `Input` (type number). Thread it through the Details (read-only) and Favorite editor modes too, so the shared layout stays consistent.
8. **`components/process-list/ProcessCardBody.tsx`** — in the top-right `CardAction` slot, when `p.port` is set render an `<a>` badge (external-link icon + port number) opening `http://localhost:<port>` in a new tab, with `onClick` stopPropagation so it doesn't trigger card-select. No port → no badge.
9. **`lib/favorites.ts`** — add optional `port` to `Favorite`; carry it through `favoriteFromProcess` / `favoriteToStartBody` so a favorited-and-relaunched process keeps its port (keeps the shared favorite editor field functional).
10. **i18n** — `locales/en.json` + `locales/zh.json`: add `dialogs.form.portLabel/portPlaceholder/portHelp` and `processes.openPortAria/openPortTitle`.

### Out of scope
- MCP tools (`src/tools/*`) keep working unchanged (new optional param defaults to undefined); I won't add a `port` MCP arg unless you want it.
- Table view won't get a port column (only the card badge, per your request).

### Verification
- Backend: `npm run build` (tsc) passes.
- Dashboard: `npm run build:dashboard` passes.
- Manual: start a process with a port → badge appears in card top-right → click opens `localhost:<port>`; start without a port → no badge.