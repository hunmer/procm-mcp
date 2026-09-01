import 'dart:math';

/// Mirrors the TS SDK's AbortSignal usage: a one-shot, listenable cancel flag.
class ProcmSignal {
  bool _aborted = false;
  final List<void Function()> _listeners = [];

  bool get aborted => _aborted;

  void abort() {
    if (_aborted) return;
    _aborted = true;
    final listeners = List.of(_listeners);
    _listeners.clear();
    for (final listener in listeners) {
      try {
        listener();
      } catch (_) {
        // Listener errors must not break the abort fan-out.
      }
    }
  }

  /// Invokes [listener] once when aborted. Returns a remover function
  /// (safe to call multiple times), or runs it immediately if already aborted.
  void Function() onAbort(void Function() listener) {
    if (_aborted) {
      listener();
      return () {};
    }
    _listeners.add(listener);
    bool removed = false;
    return () {
      if (removed) return;
      removed = true;
      _listeners.remove(listener);
    };
  }
}

/// Thrown where the TS SDK rejects with DOMException("...", "AbortError").
class ProcmAbortException implements Exception {
  final String message;
  const ProcmAbortException(this.message);

  @override
  String toString() => 'AbortError: $message';
}

final Random _random = Random.secure();

/// Random UUID v4; mirrors the TS SDK's crypto.randomUUID fallback shape.
String randomId() {
  final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hexDigits = '0123456789abcdef';
  final hex = bytes.map((b) => hexDigits[b >> 4] + hexDigits[b & 0x0f]).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
