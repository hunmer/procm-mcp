import 'dart:convert';

import 'package:http/http.dart' as http;

import 'client.dart';
import 'env.dart';
import 'protocol.dart';

/// Minimum emit level for [Logger] / [LoggerFilter]; mirrors the TS SDK's
/// `LogLevel | "silent"` (silent drops everything).
enum LoggerThreshold { debug, info, warn, error, silent }

typedef ConsoleSink = void Function(LogLevel level, String line);

class LoggerOptions {
  const LoggerOptions({
    this.client,
    this.clientName,
    this.memberId,
    this.processId,
    ConsoleSink? console,
    this.onLog,
    this.level,
  }) : _console = console;

  final ProcmClient? client;
  final String? clientName;
  final String? memberId;
  final String? processId;

  /// Custom console sink; defaults to `print`.
  final ConsoleSink? _console;
  ConsoleSink? get console => _console;

  /// Observe emitted structured entries without replacing the console sink.
  final void Function(StructuredLog entry)? onLog;

  /// Minimum level to emit; entries below it are dropped before reaching the
  /// console or the room. Defaults to [LoggerThreshold.debug].
  final LoggerThreshold? level;
}

class LogContext {
  const LogContext({this.traceId});

  final String? traceId;
}

void _defaultConsoleSink(LogLevel level, String line) => print(line);

class Logger {
  Logger([LoggerOptions options = const LoggerOptions()])
      : _options = options,
        _level = options.level ?? LoggerThreshold.debug;

  final LoggerOptions _options;
  LoggerThreshold _level;

  void setLevel(LoggerThreshold level) => _level = level;

  LoggerThreshold getLevel() => _level;

  void debug(String message, [JsonValue data, LogContext? context]) =>
      _write(LogLevel.debug, message, data, context);

  void info(String message, [JsonValue data, LogContext? context]) =>
      _write(LogLevel.info, message, data, context);

  void warn(String message, [JsonValue data, LogContext? context]) =>
      _write(LogLevel.warn, message, data, context);

  void error(String message, [JsonValue data, LogContext? context]) =>
      _write(LogLevel.error, message, data, context);

  void log(LogLevel level, String message, [JsonValue data, LogContext? context]) =>
      _write(level, message, data, context);

  void _write(LogLevel level, String message, [JsonValue? data, LogContext? context]) {
    if (_level == LoggerThreshold.silent || level.index < _level.index) return;
    final client = _options.client;
    final entry = StructuredLog(
      version: procmProtocolVersion,
      timestamp: DateTime.now().millisecondsSinceEpoch,
      level: level,
      memberId: _options.memberId ?? client?.memberId ?? 'standalone',
      clientName: _options.clientName ?? client?.clientName ?? 'app',
      processId: _options.processId ?? client?.processId,
      message: message,
      data: data,
      traceId: context?.traceId,
    );
    final onLog = _options.onLog;
    if (onLog != null) {
      try {
        onLog(entry);
      } catch (_) {
        // Observers must not interfere with the original logger output.
      }
    }
    final timestamp = DateTime.fromMillisecondsSinceEpoch(entry.timestamp).toIso8601String();
    final dataSuffix = data == null ? '' : ' ${jsonEncode(data)}';
    final readable =
        '$timestamp ${level.name.toUpperCase()} ${entry.clientName}: $message$dataSuffix';
    final sink = _options.console ?? _defaultConsoleSink;
    sink(level, '$readable ${encodeStructuredLog(entry)}');
    if (client != null && client.connectionState == ProcmConnectionState.open) {
      try {
        client.publish(procmLogTopic, entry.toJson());
      } catch (_) {
        // Console output remains the reliable fallback.
      }
    }
  }
}

// Keep the global logger inert until an integration explicitly configures it.
// This preserves the optional nature of procm integration for consumers.
Logger _defaultLogger = Logger(const LoggerOptions(level: LoggerThreshold.silent));

/// Configures the process-wide SDK logger used by integrations that do not
/// need to create and pass a Logger instance through every module.
Logger setLogger([LoggerOptions options = const LoggerOptions()]) {
  _defaultLogger = Logger(options);
  return _defaultLogger;
}

/// Returns the process-wide configured logger.
Logger getLogger() => _defaultLogger;

Logger createLogger([LoggerOptions options = const LoggerOptions()]) => Logger(options);

/// Zero-configuration setup for processes launched by procm-mcp. When room
/// variables are absent, structured console logging still works.
Logger setupLoggerFromEnv([LoggerOptions options = const LoggerOptions()]) {
  final clientName = options.clientName ?? procmEnv('PROCM_CLIENT_NAME');
  var client = options.client;
  if (client == null &&
      (procmEnv('PROCM_ROOM_ID')?.isNotEmpty ?? false) &&
      (procmEnv('PROCM_WS_URL')?.isNotEmpty ?? false)) {
    client = ProcmClient(ProcmClientOptions(clientName: clientName));
  }
  return setLogger(LoggerOptions(
    client: client,
    clientName: clientName,
    memberId: options.memberId,
    processId: options.processId,
    console: options.console,
    onLog: options.onLog,
    level: options.level,
  ));
}

/// Consumer-side filter for room log streams: entries below [minLevel] or
/// from unlisted sources are dropped before reaching the handler. Null or
/// empty lists mean "no restriction".
class LoggerFilter {
  const LoggerFilter({this.minLevel, this.clientNames, this.memberIds});

  final LoggerThreshold? minLevel;
  final List<String>? clientNames;
  final List<String>? memberIds;
}

class CollectLogsOptions extends LoggerFilter {
  const CollectLogsOptions({
    this.startTime,
    this.endTime,
    this.count,
    super.minLevel,
    super.clientNames,
    super.memberIds,
  });

  /// Inclusive Unix timestamp in milliseconds.
  final int? startTime;

  /// Inclusive Unix timestamp in milliseconds.
  final int? endTime;
  final int? count;
}

class CollectedLog extends StructuredLog {
  const CollectedLog({
    required super.version,
    required super.timestamp,
    required super.level,
    required super.memberId,
    required super.clientName,
    super.processId,
    required super.message,
    super.data,
    super.traceId,
    this.roomId,
    this.stream,
  });

  factory CollectedLog.fromJson(Map<String, Object?> json) {
    final level = parseLogLevel(json['level'] as String?);
    if (level == null) throw const FormatException('collected log has no valid level');
    return CollectedLog(
      // Backend-persisted entries omit version; treat them as current.
      version: json['version'] is num ? (json['version'] as num).toInt() : procmProtocolVersion,
      timestamp: (json['timestamp'] as num?)?.toInt() ?? 0,
      level: level,
      memberId: json['memberId'] as String? ?? '',
      clientName: json['clientName'] as String? ?? '',
      processId: json['processId'] as String?,
      message: json['message'] as String? ?? '',
      data: json['data'],
      traceId: json['traceId'] as String?,
      roomId: json['roomId'] as String?,
      stream: json['stream'] as String?,
    );
  }

  final String? roomId;
  final String? stream; // "stdout" | "stderr"
}

bool matchesLogFilter(StructuredLog entry, [LoggerFilter filter = const LoggerFilter()]) {
  final minLevel = filter.minLevel;
  if (minLevel != null &&
      minLevel != LoggerThreshold.silent &&
      entry.level.index < minLevel.index) {
    return false;
  }
  if (minLevel == LoggerThreshold.silent) return false;
  final clientNames = filter.clientNames;
  if (clientNames != null && clientNames.isNotEmpty && !clientNames.contains(entry.clientName)) {
    return false;
  }
  final memberIds = filter.memberIds;
  if (memberIds != null && memberIds.isNotEmpty && !memberIds.contains(entry.memberId)) {
    return false;
  }
  return true;
}

/// Reads structured logs persisted by the room server for a time window.
/// Unlike [subscribeLogs], also returns entries emitted before this call.
Future<List<CollectedLog>> collectLogs(
  ProcmClient client, [
  CollectLogsOptions options = const CollectLogsOptions(),
]) async {
  final target = client.connectionTarget;
  if (target.url.isEmpty) throw StateError('procm HTTP URL is required to collect logs');
  if (options.startTime != null && options.endTime != null && options.startTime! > options.endTime!) {
    throw ArgumentError('log collection startTime must be before endTime');
  }
  final base = _httpBase(target.url);
  final query = <String>[];
  void addQuery(String key, Object value) => query.add('$key=$value');
  final startTime = options.startTime;
  if (startTime != null) addQuery('startTime', startTime);
  final endTime = options.endTime;
  if (endTime != null) addQuery('endTime', endTime);
  final count = options.count;
  if (count != null) addQuery('count', count);
  final minLevel = options.minLevel;
  if (minLevel != null &&
      minLevel != LoggerThreshold.silent &&
      minLevel != LoggerThreshold.debug) {
    addQuery('level', minLevel.name);
  }
  if (options.clientNames?.length == 1) {
    addQuery('memberPrefix', Uri.encodeQueryComponent(options.clientNames![0]));
  } else if (options.memberIds?.length == 1) {
    addQuery('memberPrefix', Uri.encodeQueryComponent(options.memberIds![0]));
  }
  final headers = <String, String>{};
  if (target.token != null) headers['Authorization'] = 'Bearer ${target.token}';
  final response = await http.get(
    Uri.parse('$base/api/rooms/${Uri.encodeComponent(client.roomId)}/logs'
        '${query.isEmpty ? '' : '?${query.join('&')}'}'),
    headers: headers,
  );
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw StateError('log collection failed with HTTP ${response.statusCode}');
  }
  final payload = jsonDecode(utf8.decode(response.bodyBytes));
  final entries = payload is Map && payload['entries'] is List ? payload['entries'] as List : const [];
  CollectedLog? tryParse(Object? entry) {
    if (entry is! Map) return null;
    try {
      return CollectedLog.fromJson(entry.cast<String, Object?>());
    } catch (_) {
      return null; // entries without a parseable level are skipped, like the TS passthrough
    }
  }

  return entries
      .map(tryParse)
      .whereType<CollectedLog>()
      .where((entry) =>
          (options.startTime == null || entry.timestamp >= options.startTime!) &&
          (options.endTime == null || entry.timestamp <= options.endTime!) &&
          matchesLogFilter(entry, options))
      .toList();
}

/// Subscribes to the room's structured-log topic, forwarding only entries
/// that pass the filter (and skipping payloads that are not structured logs).
/// Returns the unsubscribe function.
void Function() subscribeLogs(
  ProcmClient client,
  void Function(StructuredLog entry, RoomMessage<JsonValue> message) handler, [
  LoggerFilter filter = const LoggerFilter(),
]) {
  return client.subscribe(procmLogTopic, (message) {
    final payload = message.payload;
    if (payload is! Map) return;
    final level = parseLogLevel(payload['level'] as String?);
    if (level == null || payload['message'] is! String) return;
    final entry = StructuredLog.fromJson(payload.cast<String, Object?>());
    if (!matchesLogFilter(entry, filter)) return;
    handler(entry, message);
  });
}

/// Derives the HTTP origin from a ws(s):// room URL (drops the `/room` tail).
String _httpBase(String url) => url
    .replaceFirstMapped(RegExp(r'^ws(s?)://'), (match) => 'http${match[1]}://')
    .replaceFirst(RegExp(r'/room/?$'), '');
