# Changelog

## 0.1.0

- Initial release.
- `ProcmClient`: WebSocket room messaging with subscribe / retained publish / `waitFor`, auto-reconnect (exponential backoff with jitter) and 20s heartbeat.
- Protocol wire frame validation, `StructuredLog` base64url codec and topic matching.
- Structured `Logger` with console + `$procm/log` dual sink, `collectLogs` / `subscribeLogs` / `matchesLogFilter`.
- `saveTrace` / `getTrace` trace storage helpers.
- `createHook` function tracing with call-chain capture and before/after handlers.
- REST wrappers for process list/update, service log management, batch import and directory picker.
- Env fallbacks: `PROCM_ROOM_ID`, `PROCM_WS_URL`, `PROCM_HTTP_TOKEN`, `PROCM_CLIENT_NAME`, `PROCM_PROCESS_ID` (`setupLoggerFromEnv()`).
