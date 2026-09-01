import 'dart:convert';

import 'package:stack_trace/stack_trace.dart';

import 'client.dart';
import 'protocol.dart';
import 'trace.dart';
import 'utils.dart';

class TraceFrame {
  const TraceFrame({
    required this.index,
    required this.functionName,
    required this.file,
    this.line,
    this.column,
    required this.isAsync,
  });

  factory TraceFrame.fromJson(Map<String, Object?> json) => TraceFrame(
        index: (json['index'] as num?)?.toInt() ?? 0,
        functionName: json['functionName'] as String? ?? '<anonymous>',
        file: json['file'] as String? ?? '<unknown>',
        line: (json['line'] as num?)?.toInt(),
        column: (json['column'] as num?)?.toInt(),
        isAsync: json['async'] as bool? ?? false,
      );

  final int index;
  final String functionName;
  final String file;
  final int? line;
  final int? column;

  /// Dart stack traces cannot reliably flag async frames; always false here
  /// (the wire field keeps compatibility with the TS SDK's format).
  final bool isAsync;

  Map<String, Object?> toJson() => {
        'index': index,
        'functionName': functionName,
        'file': file,
        'line': line,
        'column': column,
        'async': isAsync,
      };
}

class FunctionTrace {
  const FunctionTrace({
    required this.kind,
    required this.traceId,
    required this.name,
    required this.startedAt,
    required this.durationMs,
    required this.status,
    required this.callChain,
    this.args,
    this.result,
    this.error,
  });

  factory FunctionTrace.fromJson(Map<String, Object?> json) => FunctionTrace(
        kind: json['kind'] as String? ?? 'function',
        traceId: json['traceId'] as String,
        name: json['name'] as String? ?? '<anonymous>',
        startedAt: (json['startedAt'] as num?)?.toInt() ?? 0,
        durationMs: (json['durationMs'] as num?)?.toDouble() ?? 0,
        status: json['status'] as String? ?? 'returned',
        callChain: (json['callChain'] as List? ?? const [])
            .whereType<Map>()
            .map((frame) => TraceFrame.fromJson(frame.cast<String, Object?>()))
            .toList(),
        args: json['args'],
        result: json['result'],
        error: json['error'] is Map
            ? Map<String, Object?>.from(json['error'] as Map)
            : null,
      );

  final String kind;
  final String traceId;
  final String name;
  final int startedAt;
  final double durationMs;
  final String status; // returned | resolved | threw | rejected | skipped
  final List<TraceFrame> callChain;
  final JsonValue args;
  final JsonValue result;
  final Map<String, Object?>? error;

  Map<String, Object?> toJson() => {
        'kind': kind,
        'traceId': traceId,
        'name': name,
        'startedAt': startedAt,
        'durationMs': durationMs,
        'status': status,
        'callChain': callChain.map((frame) => frame.toJson()).toList(),
        if (args != null) 'args': args,
        if (result != null) 'result': result,
        if (error != null) 'error': error,
      };
}

class CreateHookOptions {
  const CreateHookOptions({
    this.client,
    this.name,
    this.captureArgs = false,
    this.captureResult = false,
    this.ttlSeconds,
    this.filterFrame,
    this.onTraceCreated,
    this.onStored,
    this.onStoreError,
  });

  final ProcmClient? client;
  final String? name;
  final bool captureArgs;
  final bool captureResult;
  final int? ttlSeconds;
  final bool Function(TraceFrame frame)? filterFrame;
  final void Function(String traceId)? onTraceCreated;
  final void Function(String traceId)? onStored;
  final void Function(Object error, String traceId)? onStoreError;
}

class BeforeHookContext {
  BeforeHookContext({
    required this.traceId,
    required this.args,
    required this.callChain,
  });

  final String traceId;
  List<Object?> args;
  final List<TraceFrame> callChain;
  bool skipped = false;
  Object? skipResult;

  void setArgs(List<Object?> next) => args = next;

  void skip([Object? result]) {
    skipped = true;
    skipResult = result;
  }
}

class AfterHookContext {
  AfterHookContext({
    required this.traceId,
    required this.args,
    required this.result,
    this.error,
    required this.callChain,
  });

  final String traceId;
  final List<Object?> args;
  Object? result;
  final Object? error;
  final List<TraceFrame> callChain;

  void setResult(Object? next) => result = next;
}

typedef BeforeHookHandler = void Function(BeforeHookContext context);
typedef AfterHookHandler = void Function(AfterHookContext context);

/// Wraps [fn] with a trace pipeline: call-chain capture, before/after
/// handlers, optional args/result capture and background trace storage.
///
/// Unlike the TS SDK (which returns the hooked function itself), Dart cannot
/// transparently forward arbitrary signatures, so call [apply] (or
/// [applyAs]) and use [asFunction] where a `Function` value is required.
class HookedFunction {
  HookedFunction._(this._fn, this._options);

  final Function _fn;
  final CreateHookOptions _options;
  final List<BeforeHookHandler> _beforeHandlers = [];
  final List<AfterHookHandler> _afterHandlers = [];

  /// The unwrapped original function.
  Function get original => _fn;

  HookedFunction before(BeforeHookHandler handler) {
    _beforeHandlers.add(handler);
    return this;
  }

  HookedFunction after(AfterHookHandler handler) {
    _afterHandlers.add(handler);
    return this;
  }

  /// Typed convenience over [apply].
  R applyAs<R>(List<Object?> positionalArgs) => apply(positionalArgs) as R;

  /// Runs the wrapped function through the hook pipeline.
  Object? apply(List<Object?> positionalArgs) {
    final traceId = randomId();
    final startedAt = DateTime.now().millisecondsSinceEpoch;
    final stopwatch = Stopwatch()..start();
    final callChain = captureCallChain(filterFrame: _options.filterFrame);
    var args = positionalArgs;
    final before = BeforeHookContext(traceId: traceId, args: args, callChain: callChain);
    _options.onTraceCreated?.call(traceId);
    for (final handler in List.of(_beforeHandlers)) {
      handler(before);
    }
    args = before.args;

    Object? complete(String status, Object? result, [Object? error]) {
      var currentResult = result;
      final after = AfterHookContext(
        traceId: traceId,
        args: args,
        result: currentResult,
        error: error,
        callChain: callChain,
      );
      for (final handler in List.of(_afterHandlers)) {
        handler(after);
      }
      currentResult = after.result;
      final trace = FunctionTrace(
        kind: 'function',
        traceId: traceId,
        name: _options.name ?? _functionName(_fn),
        startedAt: startedAt,
        durationMs: stopwatch.elapsedMicroseconds / 1000,
        status: status,
        callChain: callChain,
        args: _options.captureArgs ? _jsonValueOrPlaceholder(args) : null,
        result: _options.captureResult && error == null ? _jsonValueOrPlaceholder(currentResult) : null,
        error: error != null ? _errorDetails(error) : null,
      );
      _store(_options, trace);
      return currentResult;
    }

    if (before.skipped) return complete('skipped', before.skipResult);

    Object? result;
    try {
      result = Function.apply(_fn, args);
    } catch (error) {
      complete('threw', null, error);
      rethrow;
    }
    if (result is Future) {
      return result.then(
        (value) => complete('resolved', value),
        onError: (Object error) {
          complete('rejected', null, error);
          throw error;
        },
      );
    }
    return complete('returned', result);
  }

  /// Returns the hooked pipeline as a plain `Function(List<Object?>)`.
  /// Cast it back to the original signature at the call site:
  /// `hooked.asFunction() as int Function(int)`.
  Function asFunction() => apply;
}

String _functionName(Function fn) {
  final text = fn.toString();
  // e.g. "int Function(int)" (tear-off) or "Closure: () => ...".
  return text.startsWith('Closure: ') ? text.substring(9) : text;
}

List<TraceFrame> captureCallChain({bool Function(TraceFrame frame)? filterFrame}) {
  final frames = Trace.from(StackTrace.current).frames;
  var index = 0;
  return frames
      .where((frame) => !frame.library.endsWith('/hook.dart'))
      .map((frame) => TraceFrame(
            index: index++,
            functionName: frame.member ?? '<anonymous>',
            file: frame.library,
            line: frame.line,
            column: frame.column,
            isAsync: false,
          ))
      .where((frame) => filterFrame?.call(frame) ?? true)
      .take(100)
      .toList()
      .asMap()
      .entries
      .map((entry) => TraceFrame(
            index: entry.key,
            functionName: entry.value.functionName,
            file: entry.value.file,
            line: entry.value.line,
            column: entry.value.column,
            isAsync: entry.value.isAsync,
          ))
      .toList();
}

JsonValue _jsonValueOrPlaceholder(Object? value) {
  try {
    final text = jsonEncode(value);
    return jsonDecode(text);
  } catch (_) {
    return const {'unavailable': 'not JSON serializable'};
  }
}

Map<String, Object?> _errorDetails(Object error) {
  if (error is Error || error is Exception) {
    return {
      'name': error.runtimeType.toString(),
      'message': error.toString(),
    };
  }
  return {'name': 'Error', 'message': error.toString()};
}

void _store(CreateHookOptions options, FunctionTrace trace) {
  final client = options.client;
  if (client == null) return;
  saveTrace(client, trace.toJson(),
          SaveTraceOptions(id: trace.traceId, ttlSeconds: options.ttlSeconds))
      .then((id) => options.onStored?.call(id))
      .catchError((Object error) =>
          options.onStoreError?.call(error, trace.traceId));
}

HookedFunction createHook(Function fn, [CreateHookOptions? options]) =>
    HookedFunction._(fn, options ?? const CreateHookOptions());
