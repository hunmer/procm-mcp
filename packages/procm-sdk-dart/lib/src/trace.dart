import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'client.dart';
import 'protocol.dart';
import 'utils.dart';

const int traceMaxBytes = 262144;
const int traceMinTtlSeconds = 1;
const int traceMaxTtlSeconds = 604800;

class SaveTraceOptions {
  const SaveTraceOptions({this.id, this.ttlSeconds, this.timeout, this.signal});

  final String? id;
  final int? ttlSeconds;
  final Duration? timeout;
  final ProcmSignal? signal;
}

class TraceEnvelope<T extends Object?> {
  const TraceEnvelope({
    required this.version,
    required this.traceId,
    required this.createdAt,
    required this.roomId,
    required this.memberId,
    this.processId,
    required this.data,
  });

  factory TraceEnvelope.fromJson(Map<String, Object?> json) => TraceEnvelope<T>(
        version: (json['version'] as num).toInt(),
        traceId: json['traceId'] as String,
        createdAt: (json['createdAt'] as num).toInt(),
        roomId: json['roomId'] as String,
        memberId: json['memberId'] as String,
        processId: json['processId'] as String?,
        data: json['data'] as T,
      );

  final int version;
  final String traceId;
  final int createdAt;
  final String roomId;
  final String memberId;
  final String? processId;
  final T data;

  Map<String, Object?> toJson() => {
        'version': version,
        'traceId': traceId,
        'createdAt': createdAt,
        'roomId': roomId,
        'memberId': memberId,
        if (processId != null) 'processId': processId,
        'data': data,
      };
}

void _validateData(JsonValue data) {
  String serialized;
  try {
    serialized = jsonEncode(data);
  } catch (_) {
    throw ArgumentError('trace data must be JSON serializable');
  }
  if (utf8.encode(serialized).length > traceMaxBytes) {
    throw ArgumentError('trace data exceeds $traceMaxBytes bytes');
  }
}

/// Stores [data] in the room server's trace LRU; resolves with the traceId.
Future<String> saveTrace(
  ProcmClient client,
  JsonValue data, [
  SaveTraceOptions options = const SaveTraceOptions(),
]) async {
  if (client.connectionState != ProcmConnectionState.open) {
    throw StateError('procm client is not connected');
  }
  final ttlSeconds = options.ttlSeconds;
  if (ttlSeconds != null &&
      (!_isInt(ttlSeconds) || ttlSeconds < traceMinTtlSeconds || ttlSeconds > traceMaxTtlSeconds)) {
    throw ArgumentError(
        'trace ttlSeconds must be an integer from $traceMinTtlSeconds to $traceMaxTtlSeconds');
  }
  _validateData(data);
  if (options.signal?.aborted ?? false) throw const ProcmAbortException('trace save aborted');

  final attempts = options.id == null ? 3 : 1;
  Object? lastError;
  for (var attempt = 0; attempt < attempts; attempt++) {
    final traceId = options.id ?? randomId();
    final requestId = randomId();
    final timeout = options.timeout ?? const Duration(seconds: 10);
    try {
      final request = client.requestTraceStore(requestId, traceId, data, ttlSeconds);
      final guarded = _withGuards(request, client, requestId, timeout, options.signal);
      return await guarded;
    } catch (error) {
      lastError = error;
      if (error is! ProcmServerError || error.code != 'TRACE_STORE_CONFLICT' || options.id != null) {
        rethrow;
      }
    }
  }
  throw lastError!;
}

bool _isInt(num value) => value is int || value == value.roundToDouble();

Future<String> _withGuards(
  Future<String> request,
  ProcmClient client,
  String requestId,
  Duration timeout,
  ProcmSignal? signal,
) {
  final completer = Completer<String>();
  Timer? timer;
  void Function()? removeAbort;
  void finish() {
    timer?.cancel();
    removeAbort?.call();
  }

  request.then(
    (id) {
      finish();
      if (!completer.isCompleted) completer.complete(id);
    },
    onError: (Object error) {
      finish();
      if (!completer.isCompleted) completer.completeError(error);
    },
  );
  if (signal != null) {
    removeAbort = signal.onAbort(() {
      client.cancelTraceStore(requestId, const ProcmAbortException('trace save aborted'));
    });
  }
  timer = Timer(timeout, () {
    client.cancelTraceStore(
      requestId,
      const ProcmTraceTimeout('TRACE_REQUEST_TIMEOUT', 'trace request timed out'),
    );
  });
  return completer.future;
}

/// Distinguishes saveTrace timeouts (code `TRACE_REQUEST_TIMEOUT`) for retry
/// decisions; mirrors the TS SDK's `error.code` tagging.
class ProcmTraceTimeout implements Exception {
  const ProcmTraceTimeout(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => '$code: $message';
}

// ---------------------------------------------------------------------------
// Reading traces back through the backend's HTTP Stream MCP (trace-get tool).
// ---------------------------------------------------------------------------

const String _mcpProtocolVersion = '2025-06-18';

class GetTraceOptions {
  const GetTraceOptions({this.timeout, this.signal});

  final Duration? timeout;
  final ProcmSignal? signal;
}

({String url, String? token}) _mcpEndpoint(ProcmClient client) {
  final (:url, :token) = client.connectionTarget;
  if (url.isEmpty) {
    throw StateError('procm WebSocket URL is required to resolve the MCP endpoint');
  }
  final httpUrl = Uri.parse(url);
  return (
    url: httpUrl
        .replace(
          scheme: httpUrl.scheme == 'wss' ? 'https' : 'http',
          path: '/mcp',
          query: '',
        )
        .toString(),
    token: token,
  );
}

Future<String> _mcpPost(
  ({String url, String? token}) endpoint,
  Map<String, Object?> body,
  Duration timeout,
  ProcmSignal? signal,
) async {
  final headers = <String, String>{
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'MCP-Protocol-Version': _mcpProtocolVersion,
    if (endpoint.token != null) 'Authorization': 'Bearer ${endpoint.token}',
  };
  try {
    final response = await http
        .post(Uri.parse(endpoint.url), headers: headers, body: jsonEncode(body))
        .timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('MCP HTTP request failed with status ${response.statusCode}');
    }
    return utf8.decode(response.bodyBytes);
  } on TimeoutException {
    throw StateError('MCP request timed out after ${timeout.inMilliseconds}ms');
  }
}

Future<Map<String, Object?>?> _mcpFetch(
  ({String url, String? token}) endpoint,
  Map<String, Object?> body,
  Duration timeout,
  ProcmSignal? signal,
) async {
  final text = await _mcpPost(endpoint, body, timeout, signal);
  // Streamable HTTP replies as SSE data lines; fall back to plain JSON.
  for (final line in text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      final value = jsonDecode(line.substring(6));
      if (value is Map<String, Object?>) return value;
    } catch (_) {
      // skip malformed data line
    }
  }
  return jsonDecode(text) is Map<String, Object?> ? jsonDecode(text) as Map<String, Object?> : null;
}

final Expando<Future<void>> _mcpSessions = Expando<Future<void>>();

Future<void> _ensureMcpSession(
  ProcmClient client,
  Duration timeout,
  ProcmSignal? signal,
) {
  var session = _mcpSessions[client];
  if (session != null) return session;
  final endpoint = _mcpEndpoint(client);
  final completer = Completer<void>();
  session = completer.future;
  _mcpSessions[client] = session;
  () async {
    await _mcpFetch(endpoint, {
      'jsonrpc': '2.0',
      'id': randomId(),
      'method': 'initialize',
      'params': {
        'protocolVersion': _mcpProtocolVersion,
        'capabilities': <String, Object?>{},
        'clientInfo': {'name': 'procm-sdk-dart', 'version': '1.0'},
      },
    }, timeout, signal);
    // A JSON-RPC notification gets no response body, so send it raw.
    await _mcpPost(endpoint, {
      'jsonrpc': '2.0',
      'method': 'notifications/initialized',
    }, timeout, signal);
  }().then(
    (_) => completer.complete(),
    onError: (Object error) {
      _mcpSessions[client] = null;
      completer.completeError(error is Error ? error : StateError(error.toString()));
    },
  );
  return session;
}

/// Fetches a stored trace by ID through the same procm-mcp instance the client
/// is connected to. Throws when the trace is unknown, expired or evicted.
Future<TraceEnvelope<JsonValue>> getTrace(
  ProcmClient client,
  String id, [
  GetTraceOptions options = const GetTraceOptions(),
]) async {
  if (id.isEmpty) throw ArgumentError('trace id is required');
  final timeout = options.timeout ?? const Duration(seconds: 10);
  await _ensureMcpSession(client, timeout, options.signal);
  final response = await _mcpFetch(_mcpEndpoint(client), {
    'jsonrpc': '2.0',
    'id': randomId(),
    'method': 'tools/call',
    'params': {
      'name': 'trace-get',
      'arguments': {'id': id},
    },
  }, timeout, options.signal);
  final error = response?['error'];
  if (error is Map) {
    throw StateError(
        'MCP tools/call failed: ${error['message'] ?? 'unknown MCP error'}');
  }
  final result = response?['result'];
  final content = result is Map ? result['content'] : null;
  final parts = content is List ? content.whereType<Map>() : const <Map>[];
  final textPart = parts
      .cast<Map<Object?, Object?>>()
      .firstWhere((part) => part['type'] == 'text' && part['text'] is String,
          orElse: () => <Object?, Object?>{});
  final text = textPart['text'] as String?;
  Map<String, Object?>? payload;
  if (text != null) {
    try {
      final decoded = jsonDecode(text);
      payload = decoded is Map<String, Object?> ? decoded : null;
    } catch (_) {
      throw StateError('trace-get returned a malformed payload');
    }
  }
  final trace = payload?['trace'];
  if (payload?['ok'] != true || trace is! Map) {
    final detail = payload?['error'];
    if (detail is String) throw StateError(detail);
    if (detail is Map) {
      final code = detail['code'] ?? 'TRACE_ERROR';
      throw StateError('$code: ${detail['message'] ?? 'no message'}');
    }
    throw StateError('trace "$id" was not found');
  }
  return TraceEnvelope.fromJson(trace.cast<String, Object?>());
}
