# API Changes

## 2026-08-15

- Added optional `group` to process start requests:
  - MCP `start-process` and `batch-process`
  - REST `POST /api/processes`
  - CLI `start --group`
- Added `status` and `group` filters to the MCP `process` tool list action.
- The MCP process list action now defaults to `status=running`.
