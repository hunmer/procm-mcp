// 协议层冒烟测试：无需服务器，验证 base64url 编解码与帧校验往返。
// 环境变量 PROCM_WS_URL / PROCM_ROOM_ID 存在时，追加一次真实连接验证。
import 'dart:async';

import 'package:procm_sdk_dart/procm_sdk_dart.dart';

void expect(bool condition, String label) {
  print('${condition ? 'PASS' : 'FAIL'}: $label');
  if (!condition) throw StateError('smoke failed: $label');
}

Future<void> main() async {
  final log = const StructuredLog(
    version: procmProtocolVersion,
    timestamp: 1725200000000,
    level: LogLevel.warn,
    memberId: 'proc:app',
    clientName: 'app',
    message: 'hello 习习',
    data: {'n': 1},
    traceId: 't1',
  );
  final encoded = encodeStructuredLog(log);
  expect(encoded.startsWith(procmLogMarker), 'marker prefix');
  final decoded = decodeStructuredLogLine('prefix noise $encoded');
  expect(decoded != null && decoded.message == 'hello 习习' && decoded.level == LogLevel.warn,
      'round-trip non-ascii payload');
  expect(stripStructuredLogFrame('line $encoded') == 'line', 'strip frame');

  final frame = parseServerFrame({
    'version': procmProtocolVersion,
    'type': 'message',
    'roomId': 'r',
    'messageId': 'm',
    'memberId': 'p:a',
    'topic': 'a/b',
    'timestamp': 1,
    'payload': const [1, true, null],
  });
  expect(frame != null, 'server frame accepted');
  expect(parseClientFrame({'version': 2, 'type': 'ping', 'timestamp': 1}) == null,
      'bad version rejected');
  expect(matchesTopic('a/b/c', 'a/', prefix: true) && !matchesTopic('a/b/c', 'a/'),
      'topic matching');

  expect(parseLogLevel('warn') == LogLevel.warn && parseLogLevel('x') == null, 'level parsing');

  // Optional live check against a running procm-mcp server.
  final url = const String.fromEnvironment('PROCM_WS_URL', defaultValue: '');
  final roomId = const String.fromEnvironment('PROCM_ROOM_ID', defaultValue: '');
  if (url.isEmpty || roomId.isEmpty) {
    print('SKIP: live connection (no PROCM_WS_URL / PROCM_ROOM_ID)');
    return;
  }
  final client = createProcmClient(ProcmClientOptions(
    url: url,
    roomId: roomId,
    clientName: 'dart-smoke',
  ));
  final states = <ProcmConnectionState>[];
  client.onState(states.add);
  final timer = Timer(const Duration(seconds: 5), () => client.close());
  final message = await client.waitFor('dart/smoke', WaitForOptions(
    filter: (payload, m) => m.memberId == client.memberId,
  ));
  client.publish('dart/smoke', const {'ok': true});
  expect(message.payload is Map && (message.payload as Map)['ok'] == true, 'live pub/sub echo');
  final traceId = await saveTrace(client, const {'smoke': true});
  final envelope = await getTrace(client, traceId);
  expect((envelope.data as Map)['smoke'] == true, 'live trace round-trip');
  timer.cancel();
  client.close();
  print('live states: $states');
  await Future<void>.delayed(Duration.zero);
}
