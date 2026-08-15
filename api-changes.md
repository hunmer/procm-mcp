# API Changes

## 2026-08-15

- Added optional `overwrite` and `restart` flags to REST `POST /api/processes`.
  Named processes now reject duplicates unless `overwrite=true`; replacing a
  running named process additionally requires `restart=true`.
- Added `favorite` to process records and public REST/WS views, plus
  `PATCH /api/processes/:id` with body `{ favorite: boolean }`.
- Added optional `group` to process start requests:
  - MCP `start-process` and `batch-process`
  - REST `POST /api/processes`
  - CLI `start --group`
- Added `status` and `group` filters to the MCP `process` tool list action.
- The MCP process list action now defaults to `status=running`.
