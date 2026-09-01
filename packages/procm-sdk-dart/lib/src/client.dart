import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:web_socket_channel/web_socket_channel.dart';

import 'env.dart';
import 'protocol.dart';
import 'utils.dart';

enum ProcmConnectionState { connecting, open, closed }

enum MemberEvent { joined, left, replaced }

typedef MessageHandler = void Function(RoomMessage<JsonValue> message);
typedef MemberHandler = void Function(MemberEvent event, RoomMember member);
typedef StateHandler = void Function(ProcmConnectionState state);

typedef WebSocketFactory = WebSocketChannel Function(Uri uri, List<String>? protocols);

class ProcmClientOptions {
  const ProcmClientOptions({
    this.url,
    this.roomId,
    this.processId,
    this.clientName,
    this.memberId,
    this.token,
    this.metadata,
    this.reconnect = true,
    this.webSocketFactory,
  });

  final String? url;
  final String? roomId;
  final String? processId;
  final String? clientName;
  final String? memberId;
  final String? token;
  final Map<String, JsonValue>? metadata;
  final bool reconnect;
  final WebSocketFactory? webSocketFactory;
}

class SubscribeOptions {
  const SubscribeOptions({this.prefix = false});

  final bool prefix;
}

class PublishOptions {
  const PublishOptions({this.retain, this.correlationId});

  final bool? retain;
  final String? correlationId;
}

class WaitForOptions<T extends Object?> {
  const WaitForOptions({this.prefix = false, this.filter, this.timeout, this.signal});

  final bool prefix;
  final bool Function(T payload, RoomMessage<T> message)? filter;
  final Duration? timeout;
  final ProcmSignal? signal;
}

class _Subscription {
  const _Subscription({
    required this.id,
    required this.topic,
    required this.prefix,
    required this.handler,
  });

  final String id;
  final String topic;
  final bool prefix;
  final MessageHandler handler;
}

WebSocketChannel _defaultWebSocketFactory(Uri uri, List<String>? protocols) =>
    WebSocketChannel.connect(uri, protocols: protocols);

/// WebSocket room client: subscribe / retained publish / waitFor /
/// automatic reconnect with exponential backoff and a 20s heartbeat.
class ProcmClient {
  ProcmClient([ProcmClientOptions options = const ProcmClientOptions()])
      : _options = options,
        roomId = options.roomId ?? procmEnv('PROCM_ROOM_ID') ?? '',
        processId = options.processId ?? procmEnv('PROCM_PROCESS_ID'),
        clientName = options.clientName ?? procmEnv('PROCM_CLIENT_NAME') ?? 'client',
        memberId = _resolveMemberId(options) {
    if (roomId.isEmpty) throw ArgumentError('procm roomId is required');
    scheduleMicrotask(connect);
  }

  static String _resolveMemberId(ProcmClientOptions options) {
    if (options.memberId != null) return options.memberId!;
    final processId = options.processId ?? procmEnv('PROCM_PROCESS_ID');
    final clientName = options.clientName ?? procmEnv('PROCM_CLIENT_NAME') ?? 'client';
    return processId != null ? '$processId:$clientName' : '$clientName:${randomId()}';
  }

  final ProcmClientOptions _options;
  final Map<String, _Subscription> _subscriptions = {};
  final Set<MemberHandler> _memberHandlers = {};
  final Set<StateHandler> _stateHandlers = {};
  final Map<String, Completer<String>> _pendingTraceRequests = {};
  WebSocketChannel? _channel;
  bool _disposed = false;
  int _reconnectAttempt = 0;
  Timer? _reconnectTimer;
  Timer? _heartbeatTimer;
  ProcmConnectionState _state = ProcmConnectionState.closed;
  StreamSubscription<Object?>? _streamSubscription;

  final String roomId;
  final String? processId;
  final String clientName;
  final String memberId;

  ProcmConnectionState get connectionState => _state;

  int get pendingTraceRequestCount => _pendingTraceRequests.length;

  /// Resolved WebSocket connection target (raw URL + optional auth token)
  /// as used by [connect]. Exposed so companion transports, e.g. the MCP HTTP
  /// endpoint derived in trace.dart, can reach the same backend.
  ({String url, String? token}) get connectionTarget => (
        url: _options.url ?? procmEnv('PROCM_WS_URL') ?? '',
        token: _options.token ?? procmEnv('PROCM_HTTP_TOKEN'),
      );

  Future<void> connect() async {
    if (_disposed || _channel != null) return;
    final rawUrl = _options.url ?? procmEnv('PROCM_WS_URL');
    if (rawUrl == null || rawUrl.isEmpty) {
      throw StateError('procm WebSocket URL is required');
    }
    final token = _options.token ?? procmEnv('PROCM_HTTP_TOKEN');
    final url = token != null ? _appendToken(rawUrl, token) : rawUrl;
    final factory = _options.webSocketFactory ?? _defaultWebSocketFactory;
    _setState(ProcmConnectionState.connecting);
    final channel = factory(Uri.parse(url), token != null ? ['bearer.$token'] : null);
    _channel = channel;

    try {
      await channel.ready;
    } catch (_) {
      _handleClose(channel);
      return;
    }
    if (_disposed || _channel != channel) return;

    channel.sink.add(jsonEncode({
      'version': procmProtocolVersion,
      'type': 'hello',
      'roomId': roomId,
      'memberId': memberId,
      'clientName': clientName,
      if (processId != null) 'processId': processId,
      if (_options.metadata != null) 'metadata': _options.metadata,
    }));
    _reconnectAttempt = 0;
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      _send({'version': procmProtocolVersion, 'type': 'ping', 'timestamp': DateTime.now().millisecondsSinceEpoch});
    });
    _streamSubscription = channel.stream.listen(
      _handleMessage,
      onError: (_) => channel.sink.close(),
      onDone: () => _handleClose(channel),
      cancelOnError: true,
    );
  }

  /// Subscribes to [topic]; returns the unsubscribe function. Subscriptions
  /// are replayed automatically after reconnecting.
  void Function() subscribe(String topic, MessageHandler handler, [SubscribeOptions? options]) {
    if (topic.isEmpty) throw ArgumentError('subscription topic is required');
    final subscription = _Subscription(
      id: randomId(),
      topic: topic,
      prefix: options?.prefix ?? false,
      handler: handler,
    );
    _subscriptions[subscription.id] = subscription;
    if (_state == ProcmConnectionState.open) _sendSubscription(subscription);
    bool removed = false;
    return () {
      if (removed) return;
      removed = true;
      if (_subscriptions.remove(subscription.id) == null) return;
      _send({
        'version': procmProtocolVersion,
        'type': 'unsubscribe',
        'subscriptionId': subscription.id,
      });
    };
  }

  /// Publishes [payload]; returns the messageId. Throws when not connected.
  String publish(String topic, JsonValue payload, [PublishOptions? options]) {
    if (topic.isEmpty) throw ArgumentError('publish topic is required');
    final messageId = randomId();
    _send({
      'version': procmProtocolVersion,
      'type': 'publish',
      'messageId': messageId,
      'topic': topic,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      'payload': payload,
      if (options?.retain != null) 'retain': options!.retain,
      if (options?.correlationId != null) 'correlationId': options!.correlationId,
    });
    return messageId;
  }

  /// Resolves with the first message on [topic] passing [WaitForOptions.filter].
  Future<RoomMessage<T>> waitFor<T extends Object?>(
    String topic, [
    WaitForOptions<T>? options,
  ]) {
    options ??= WaitForOptions<T>();
    final completer = Completer<RoomMessage<T>>();
    Timer? timer;
    void Function()? removeAbort;
    late final void Function() cleanup;
    final unsubscribe = subscribe(topic, (message) {
      final typed = RoomMessage<T>.fromJson(message.toJson());
      if (options!.filter != null && !options.filter!(typed.payload, typed)) return;
      if (!completer.isCompleted) completer.complete(typed);
      cleanup();
    }, SubscribeOptions(prefix: options.prefix));
    void abort() {
      if (!completer.isCompleted) {
        completer.completeError(const ProcmAbortException('waitFor aborted'));
      }
      cleanup();
    }

    cleanup = () {
      unsubscribe();
      timer?.cancel();
      removeAbort?.call();
    };
    if (options.signal != null) {
      if (options.signal!.aborted) {
        abort();
        return completer.future;
      }
      removeAbort = options.signal!.onAbort(abort);
    }
    final timeout = options.timeout;
    if (timeout != null) {
      timer = Timer(timeout, () {
        if (!completer.isCompleted) {
          completer.completeError(StateError('waitFor timed out after ${timeout.inMilliseconds}ms'));
        }
        cleanup();
      });
    }
    return completer.future;
  }

  void Function() onMember(MemberHandler handler) {
    _memberHandlers.add(handler);
    bool removed = false;
    return () {
      if (removed) return;
      removed = true;
      _memberHandlers.remove(handler);
    };
  }

  /// Registers a state handler; the current state is replayed immediately.
  void Function() onState(StateHandler handler) {
    _stateHandlers.add(handler);
    handler(_state);
    bool removed = false;
    return () {
      if (removed) return;
      removed = true;
      _stateHandlers.remove(handler);
    };
  }

  /// Idempotent teardown: stops reconnection, closes the socket and rejects
  /// all pending trace requests.
  void close() {
    _disposed = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    _streamSubscription?.cancel();
    _streamSubscription = null;
    _channel?.sink.close();
    _channel = null;
    _rejectPendingTraceRequests(StateError('procm client closed'));
    _setState(ProcmConnectionState.closed);
  }

  Future<String> requestTraceStore(
    String requestId,
    String traceId,
    JsonValue payload,
    int? ttlSeconds,
  ) {
    if (_state != ProcmConnectionState.open) {
      return Future.error(StateError('procm client is not connected'));
    }
    final completer = Completer<String>();
    _pendingTraceRequests[requestId] = completer;
    try {
      _send({
        'version': procmProtocolVersion,
        'type': 'trace:put',
        'requestId': requestId,
        'traceId': traceId,
        if (ttlSeconds != null) 'ttlSeconds': ttlSeconds,
        'payload': payload,
      });
    } catch (error) {
      _pendingTraceRequests.remove(requestId);
      completer.completeError(error is Error ? error : StateError(error.toString()));
    }
    return completer.future;
  }

  void cancelTraceStore(String requestId, Object error) {
    final pending = _pendingTraceRequests.remove(requestId);
    if (pending != null && !pending.isCompleted) pending.completeError(error);
  }

  void _handleMessage(Object? raw) {
    try {
      final text = raw is String ? raw : utf8.decode(raw as List<int>);
      final frame = parseServerFrame(jsonDecode(text));
      if (frame == null) return;
      switch (frame['type']) {
        case 'welcome':
          _setState(ProcmConnectionState.open);
          for (final subscription in List.of(_subscriptions.values)) {
            _sendSubscription(subscription);
          }
        case 'message':
          final message = RoomMessage.fromJson(frame);
          for (final subscription in List.of(_subscriptions.values)) {
            if (matchesTopic(message.topic, subscription.topic, prefix: subscription.prefix)) {
              subscription.handler(message);
            }
          }
        case 'member':
          final member = RoomMember.fromJson((frame['member'] as Map).cast<String, Object?>());
          final event = switch (frame['event']) {
            'joined' => MemberEvent.joined,
            'left' => MemberEvent.left,
            _ => MemberEvent.replaced,
          };
          for (final handler in List.of(_memberHandlers)) {
            handler(event, member);
          }
        case 'trace:stored':
          final pending = _pendingTraceRequests.remove(frame['requestId']);
          if (pending != null && !pending.isCompleted) {
            pending.complete(frame['traceId'] as String);
          }
        case 'error':
          final requestId = frame['requestId'];
          if (requestId is String) {
            final pending = _pendingTraceRequests.remove(requestId);
            if (pending != null && !pending.isCompleted) {
              pending.completeError(
                ProcmServerError(frame['message'] as String? ?? 'unknown error',
                    code: frame['code'] as String?),
              );
            }
          }
        case 'pong':
          break;
      }
    } catch (_) {
      // Malformed frames are ignored; the server remains authoritative.
    }
  }

  void _handleClose(WebSocketChannel channel) {
    if (!identical(channel, _channel)) return;
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    _streamSubscription?.cancel();
    _streamSubscription = null;
    _channel = null;
    _rejectPendingTraceRequests(StateError('procm WebSocket closed'));
    _setState(ProcmConnectionState.closed);
    if (!_disposed && _options.reconnect) {
      final base = min(500 * pow(2, _reconnectAttempt++), 10000);
      final delay = (base * (0.8 + Random().nextDouble() * 0.4)).round();
      _reconnectTimer = Timer(Duration(milliseconds: delay), () => connect());
    }
  }

  void _send(Map<String, Object?> frame) {
    if (_state != ProcmConnectionState.open) {
      if (frame['type'] == 'publish') throw StateError('procm client is not connected');
      return;
    }
    _channel?.sink.add(jsonEncode(frame));
  }

  void _sendSubscription(_Subscription subscription) {
    _send({
      'version': procmProtocolVersion,
      'type': 'subscribe',
      'subscriptionId': subscription.id,
      'topic': subscription.topic,
      'prefix': subscription.prefix,
    });
  }

  void _setState(ProcmConnectionState state) {
    if (_state == state) return;
    _state = state;
    for (final handler in List.of(_stateHandlers)) {
      handler(state);
    }
  }

  void _rejectPendingTraceRequests(Object error) {
    final pending = Map.of(_pendingTraceRequests);
    _pendingTraceRequests.clear();
    for (final completer in pending.values) {
      if (!completer.isCompleted) completer.completeError(error);
    }
  }
}

/// Server-side error frame surfaced to requestTraceStore callers.
class ProcmServerError implements Exception {
  const ProcmServerError(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => code == null ? message : '$code: $message';
}

String _appendToken(String rawUrl, String token) {
  final url = Uri.parse(rawUrl);
  if (url.queryParameters.containsKey('token')) return url.toString();
  final separator = url.query.isEmpty ? '?' : '&';
  return '$url${separator}token=${Uri.encodeQueryComponent(token)}';
}

/// Convenience factory mirroring the TS SDK's createProcmClient().
ProcmClient createProcmClient([ProcmClientOptions options = const ProcmClientOptions()]) =>
    ProcmClient(options);
