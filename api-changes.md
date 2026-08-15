# API Changes

## 2026-08-15

- Removed WebSocket `type: "processes"` snapshots; clients must use
  `GET /api/processes` for process-list data. WebSocket log messages remain.
- Added optional `startedAt` to `GET /api/processes` responses so the dashboard
  can use the REST API for server uptime without consuming process-list WS messages.
- Added optional `overwrite` and `restart` flags to REST `POST /api/processes`.
  Named processes now reject duplicates unless `overwrite=true`; replacing a
  running named process additionally requires `restart=true`.
- Added `favorite` to process records and public REST/WS views, plus
  `PATCH /api/processes/:id` with body `{ favorite: boolean }`.
- REST `POST /api/processes` accepts `favorite: boolean`; scanned commands can
  be imported directly into a process group with this flag.
- Added `POST /api/processes/import` to save a favorite process configuration
  without starting it.
- Added optional `group` to process start requests:
  - MCP `start-process` and `batch-process`
  - REST `POST /api/processes`
  - CLI `start --group`
- Added `status` and `group` filters to the MCP `process` tool list action.
- The MCP process list action now defaults to `status=running`.
