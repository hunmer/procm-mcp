import 'dart:convert';

const int procmProtocolVersion = 1;
const String procmLogTopic = r'$procm/log';
const String procmLogMarker = '@@PROCM_LOG_V1@@';

/// Any value that survives a JSON round-trip (`null | bool | num | String |
/// `List<JsonValue>` | `Map<String, JsonValue>`).
typedef JsonValue = Object?;

enum LogLevel { debug, info, warn, error }

LogLevel? parseLogLevel(String? value) => switch (value) {
      'debug' => LogLevel.debug,
      'info' => LogLevel.info,
      'warn' => LogLevel.warn,
      'error' => LogLevel.error,
      _ => null,
    };

bool isRecord(Object? value) => value is Map;

Map<String, Object?>? _asRecord(Object? value) =>
    value is Map && value.keys.every((key) => key is String)
        ? Map<String, Object?>.from(value)
        : null;

class RoomMember {
  const RoomMember({
    required this.memberId,
    required this.connectionId,
    required this.clientName,
    this.processId,
    required this.connectedAt,
    this.metadata,
  });

  factory RoomMember.fromJson(Map<String, Object?> json) => RoomMember(
        memberId: json['memberId'] as String,
        connectionId: json['connectionId'] as String,
        clientName: json['clientName'] as String,
        processId: json['processId'] as String?,
        connectedAt: (json['connectedAt'] as num).toInt(),
        metadata: () {
          final raw = json['metadata'];
          return raw is Map<String, Object?> ? Map.of(raw) : null;
        }(),
      );

  final String memberId;
  final String connectionId;
  final String clientName;
  final String? processId;
  final int connectedAt;
  final Map<String, JsonValue>? metadata;

  Map<String, Object?> toJson() => {
        'memberId': memberId,
        'connectionId': connectionId,
        'clientName': clientName,
        if (processId != null) 'processId': processId,
        'connectedAt': connectedAt,
        if (metadata != null) 'metadata': metadata,
      };

  @override
  bool operator ==(Object other) =>
      other is RoomMember && other.memberId == memberId && other.connectionId == connectionId;

  @override
  int get hashCode => Object.hash(memberId, connectionId);

  @override
  String toString() => 'RoomMember($memberId, client: $clientName)';
}

class RoomMessage<T extends Object?> {
  const RoomMessage({
    required this.version,
    required this.type,
    required this.roomId,
    required this.messageId,
    required this.memberId,
    required this.topic,
    required this.timestamp,
    required this.payload,
    this.retain,
    this.correlationId,
  });

  factory RoomMessage.fromJson(Map<String, Object?> json) => RoomMessage<T>(
        version: (json['version'] as num).toInt(),
        type: json['type'] as String,
        roomId: json['roomId'] as String,
        messageId: json['messageId'] as String,
        memberId: json['memberId'] as String,
        topic: json['topic'] as String,
        timestamp: (json['timestamp'] as num).toInt(),
        payload: json['payload'] as T,
        retain: json['retain'] as bool?,
        correlationId: json['correlationId'] as String?,
      );

  final int version;
  final String type;
  final String roomId;
  final String messageId;
  final String memberId;
  final String topic;
  final int timestamp;
  final T payload;
  final bool? retain;

  /// Request/response correlation: publishers may tag a message, responders
  /// echo the tag on the reply so both sides can pair them up.
  final String? correlationId;

  Map<String, Object?> toJson() => {
        'version': version,
        'type': type,
        'roomId': roomId,
        'messageId': messageId,
        'memberId': memberId,
        'topic': topic,
        'timestamp': timestamp,
        'payload': payload,
        if (retain != null) 'retain': retain,
        if (correlationId != null) 'correlationId': correlationId,
      };

  @override
  String toString() => 'RoomMessage($topic from $memberId id $messageId)';
}

class StructuredLog {
  const StructuredLog({
    required this.version,
    required this.timestamp,
    required this.level,
    required this.memberId,
    required this.clientName,
    this.processId,
    required this.message,
    this.data,
    this.traceId,
  });

  factory StructuredLog.fromJson(Map<String, Object?> json) {
    final level = parseLogLevel(json['level'] as String?);
    if (level == null) {
      throw const FormatException('structured log has no valid level');
    }
    return StructuredLog(
      version: (json['version'] as num).toInt(),
      timestamp: (json['timestamp'] as num).toInt(),
      level: level,
      memberId: json['memberId'] as String,
      clientName: json['clientName'] as String,
      processId: json['processId'] as String?,
      message: json['message'] as String,
      data: json['data'],
      traceId: json['traceId'] as String?,
    );
  }

  final int version;
  final int timestamp;
  final LogLevel level;
  final String memberId;
  final String clientName;
  final String? processId;
  final String message;
  final JsonValue data;
  final String? traceId;

  Map<String, Object?> toJson() => {
        'version': version,
        'timestamp': timestamp,
        'level': level.name,
        'memberId': memberId,
        'clientName': clientName,
        if (processId != null) 'processId': processId,
        'message': message,
        'data': data,
        if (traceId != null) 'traceId': traceId,
      };

  @override
  String toString() => 'StructuredLog(${level.name} $clientName: $message)';
}

/// Payload shape used by the backend's WebSocket `processes` messages.
class ProcessesMessagePayload {
  const ProcessesMessagePayload({
    this.serverId,
    this.pid,
    this.startedAt,
    this.port,
    required this.data,
    this.snapshot,
  });

  factory ProcessesMessagePayload.fromJson(Map<String, Object?> json) =>
      ProcessesMessagePayload(
        serverId: json['serverId'] as String?,
        pid: json['pid'] as int?,
        startedAt: json['startedAt'] as int?,
        port: json['port'] as int?,
        data: json['data'] is List ? List<Object?>.from(json['data'] as List) : const [],
        snapshot: json['snapshot'] as bool?,
      );

  final String? serverId;
  final int? pid;
  final int? startedAt;
  final int? port;
  final List<Object?> data;
  final bool? snapshot;

  Map<String, Object?> toJson() => {
        if (serverId != null) 'serverId': serverId,
        if (pid != null) 'pid': pid,
        if (startedAt != null) 'startedAt': startedAt,
        if (port != null) 'port': port,
        'data': data,
        if (snapshot != null) 'snapshot': snapshot,
      };
}

// Client/server frames stay as validated maps (like the TS SDK, which parses
// then trusts the discriminated union): keys mirror the wire format exactly.

/// Validates and returns a client frame, or null when the value is malformed.
Map<String, Object?>? parseClientFrame(Object? value) {
  final frame = _asRecord(value);
  if (frame == null || frame['version'] != procmProtocolVersion) return null;
  switch (frame['type']) {
    case 'hello':
      return frame['roomId'] is String &&
              frame['memberId'] is String &&
              frame['clientName'] is String
          ? frame
          : null;
    case 'subscribe':
      return frame['subscriptionId'] is String && frame['topic'] is String ? frame : null;
    case 'unsubscribe':
      return frame['subscriptionId'] is String ? frame : null;
    case 'publish':
      return frame['messageId'] is String &&
              frame['topic'] is String &&
              frame['timestamp'] is num &&
              (frame['correlationId'] == null || frame['correlationId'] is String) &&
              frame.containsKey('payload')
          ? frame
          : null;
    case 'trace:put':
      return frame['requestId'] is String &&
              frame['traceId'] is String &&
              (frame['ttlSeconds'] == null || frame['ttlSeconds'] is num) &&
              frame.containsKey('payload')
          ? frame
          : null;
    case 'ping':
      return frame['timestamp'] is num ? frame : null;
    default:
      return null;
  }
}

const _serverFrameTypes = {'welcome', 'message', 'member', 'error', 'trace:stored', 'pong'};

/// Validates and returns a server frame, or null when the value is malformed.
Map<String, Object?>? parseServerFrame(Object? value) {
  final frame = _asRecord(value);
  if (frame == null || frame['version'] != procmProtocolVersion) return null;
  return _serverFrameTypes.contains(frame['type']) ? frame : null;
}

bool matchesTopic(String topic, String filter, {bool prefix = false}) =>
    prefix ? topic.startsWith(filter) : topic == filter;

String _encodeBase64Url(String text) =>
    base64Url.encode(utf8.encode(text)).replaceAll('=', '');

String _decodeBase64Url(String text) {
  final normalized = text.replaceAll('-', '+').replaceAll('_', '/');
  final padded = normalized + '=' * ((4 - normalized.length % 4) % 4);
  return utf8.decode(base64.decode(padded));
}

String encodeStructuredLog(StructuredLog log) =>
    procmLogMarker + _encodeBase64Url(jsonEncode(log.toJson()));

StructuredLog? decodeStructuredLogLine(String line) {
  final markerIndex = line.lastIndexOf(procmLogMarker);
  if (markerIndex == -1) return null;
  try {
    final value = jsonDecode(
      _decodeBase64Url(line.substring(markerIndex + procmLogMarker.length).trim()),
    );
    final record = _asRecord(value);
    if (record == null || record['version'] != procmProtocolVersion) return null;
    if (record['timestamp'] is! num ||
        parseLogLevel(record['level'] as String?) == null ||
        record['memberId'] is! String ||
        record['clientName'] is! String ||
        record['message'] is! String) {
      return null;
    }
    return StructuredLog.fromJson(record);
  } catch (_) {
    return null;
  }
}

String stripStructuredLogFrame(String line) {
  final markerIndex = line.lastIndexOf(procmLogMarker);
  return markerIndex == -1 ? line : line.substring(0, markerIndex).trimRight();
}
