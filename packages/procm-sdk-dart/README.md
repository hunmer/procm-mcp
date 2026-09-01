# procm_sdk_dart

procm-mcp 房间系统的 Dart 客户端 SDK，复刻自 `packages/procm-sdk`（`@hunmer/procm-mcp-sdk`）。

纯库无进程，VM（dart:io）、Flutter 与 Web 通用。运行时依赖仅 `http`、`web_socket_channel`、`stack_trace`。

## 能力总览

| 模块 | 说明 |
|---|---|
| `lib/src/client.dart` | `ProcmClient` WebSocket 房间消息：订阅 / retain 发布 / waitFor / 自动重连（指数退避 + 抖动）/ 20s 心跳 |
| `lib/src/protocol.dart` | 协议常量、wire 帧校验、`StructuredLog` base64url 编解码、topic 匹配 |
| `lib/src/logger.dart` | `Logger` 结构化日志（console + `$procm/log` 双写）、`collectLogs` / `subscribeLogs` / `matchesLogFilter` |
| `lib/src/trace.dart` | `saveTrace`（`trace:put`）、`getTrace`（经后端 HTTP Stream MCP 的 `trace-get` 工具） |
| `lib/src/hook.dart` | `createHook` 函数追踪：调用链捕获 + before/after 处理器 + trace 存储 |
| `lib/src/rest.dart` | 后端 REST 封装：进程列表/更新、服务日志管理、清日志、批量导入、目录选择器 |

## 快速上手

```dart
import 'package:procm_sdk_dart/procm_sdk_dart.dart';

Future<void> main() async {
  final client = createProcmClient(ProcmClientOptions(
    url: 'ws://127.0.0.1:7332/room',
    roomId: 'test',
    clientName: 'dart-client',
  ));

  client.onState((state) => print('state: $state'));
  final unsubscribe = client.subscribe('demo/topic', (message) {
    print('recv: ${message.payload}');
  });

  final reply = await client.waitFor('demo/reply', WaitForOptions(
    timeout: const Duration(seconds: 5),
  ));

  client.publish('demo/topic', {'hello': 'world'}, PublishOptions(retain: true));

  final logger = createLogger(LoggerOptions(client: client));
  logger.info('started', {'pid': 123});

  final traceId = await saveTrace(client, {'any': 'json'});
  final envelope = await getTrace(client, traceId);

  unsubscribe();
  client.close();
}
```

环境变量兜底与 TS 版一致：`PROCM_ROOM_ID`、`PROCM_WS_URL`、`PROCM_HTTP_TOKEN`、`PROCM_CLIENT_NAME`、`PROCM_PROCESS_ID`（`setupLoggerFromEnv()` 零配置接入）。

## 与 TS 版的 API 对应

| TS (`@hunmer/procm-mcp-sdk`) | Dart (`procm_sdk_dart`) |
|---|---|
| `createProcmClient(options)` | `createProcmClient([options])` |
| `client.subscribe(topic, handler, {prefix})` | `client.subscribe(topic, handler, [SubscribeOptions])`，返回退订函数 |
| `client.publish(topic, payload, {retain, correlationId})` | `client.publish(topic, payload, [PublishOptions])`，返回 messageId |
| `client.waitFor(topic, {prefix, filter, timeout, signal})` | `client.waitFor<T>(topic, [WaitForOptions])`，`timeout` 为 `Duration` |
| `onMember` / `onState` / `close` / `connectionTarget` | 同名成员；事件为 `MemberEvent` / `ProcmConnectionState` 枚举 |
| `AbortSignal` | `ProcmSignal`（`abort()` / `aborted` / `onAbort`），抛 `ProcmAbortException` |
| `createLogger` / `setLogger` / `getLogger` / `setupLoggerFromEnv` | 同名；`level: "silent"` → `LoggerThreshold.silent` |
| `collectLogs` / `subscribeLogs` / `matchesLogFilter` | 同名，`startTime`/`endTime` 为 Unix 毫秒 |
| `saveTrace` / `getTrace` / `TRACE_MAX_BYTES` 等 | 同名小驼峰（`traceMaxBytes` / `traceMinTtlSeconds` / `traceMaxTtlSeconds`） |
| `createHook(fn, options)` | `createHook(fn, [options])`，返回 `HookedFunction`（见下） |
| `PROCM_PROTOCOL_VERSION` 等常量 | `procmProtocolVersion` / `procmLogTopic` / `procmLogMarker` |
| `parseClientFrame` / `parseServerFrame` / `matchesTopic` / `encodeStructuredLog` / `decodeStructuredLogLine` / `stripStructuredLogFrame` | 同名；帧为已校验的 `Map<String, Object?>` |
| rest.ts 全部函数 | 同名小驼峰（`listProcesses`、`clearLogs`、`importProcessBatch`、`selectDirectory` …） |

## 平台差异（有意为之）

- **无 `custom-execution`**：TS 版通过 `eval` 远程求值执行任意函数源码，Dart 无动态求值能力，该模块不复刻。
- **`createHook` 返回包装对象**：Dart 无法透明转发任意签名。使用 `hooked.apply([args])`（或 `applyAs<R>`）调用，需要 `Function` 值时用 `hooked.asFunction()` 再 cast 回原签名；`hooked.original` 取原函数。
- **无 `hookProperty`**：Dart 没有属性描述符，无法重定义 getter/setter。
- **调用链 `async` 字段恒为 `false`**：Dart 堆栈无法可靠区分异步帧；wire 字段保留兼容。
- **无 `captureConsole`**：Dart 没有可替换的全局 console；用 `LoggerOptions.console` 注入自定义 sink（默认 `print`）。
- **before/after 处理器天然同步**：类型系统保证（TS 版为运行时断言）。

## 开发

```bash
cd packages/procm-sdk-dart
dart pub get
dart analyze        # 静态检查
dart run example/smoke.dart   # 协议编解码冒烟（无需服务器）
```
