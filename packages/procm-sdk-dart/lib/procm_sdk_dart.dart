/// Dart client and structured logger for procm-mcp rooms.
///
/// Mirrors the TypeScript SDK `@hunmer/procm-mcp-sdk`:
/// - [ProcmClient] / [createProcmClient]: WebSocket room messaging
///   (subscribe / retained publish / waitFor / auto-reconnect).
/// - [Logger] / [createLogger] / [setupLoggerFromEnv]: structured logging
///   (console + `$procm/log` dual write, base64url marker).
/// - [createHook] / [saveTrace] / [getTrace]: function tracing with call-chain
///   capture and backend LRU storage.
/// - `rest.dart`: backend REST helpers (log clearing / batch import /
///   directory picker).
library;

export 'src/client.dart' hide WebSocketFactory;
export 'src/hook.dart';
export 'src/logger.dart';
export 'src/protocol.dart';
export 'src/rest.dart';
export 'src/trace.dart';
export 'src/utils.dart' show ProcmSignal, ProcmAbortException;
