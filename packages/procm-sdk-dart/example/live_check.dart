// 真实链路验证：连接 / 订阅转发 / retain waitFor / trace 存取 / 日志收集 / REST。
// 用法：PROCM_WS_URL=ws://127.0.0.1:<port>/room dart run example/live_check.dart
// 需要一个已运行的 procm-mcp --server 后端（tests/_helpers.mjs 同款临时实例）。
import 'dart:async';
import 'dart:io';

import 'package:procm_sdk_dart/procm_sdk_dart.dart';

int passed = 0;

void expect(bool condition, String label) {
  print('${condition ? 'PASS' : 'FAIL'}: $label');
  if (condition) {
    passed++;
  } else {
    throw StateError('live check failed: $label');
  }
}

Future<void> main(List<String> args) async {
  final url = Platform.environment['PROCM_WS_URL'] ?? args.firstOrNull;
  if (url == null) {
    stderr.writeln('usage: PROCM_WS_URL=ws://host:port/room dart run example/live_check.dart');
    exitCode = 2;
    return;
  }
  final room = 'dart-live-${DateTime.now().millisecondsSinceEpoch}';

  Future<ProcmClient> join(String name) async {
    final client = createProcmClient(ProcmClientOptions(
      url: url,
      roomId: room,
      clientName: name,
      reconnect: false,
    ));
    final opened = Completer<void>();
    client.onState((state) {
      if (state == ProcmConnectionState.open && !opened.isCompleted) opened.complete();
    });
    await opened.future.timeout(const Duration(seconds: 5));
    return client;
  }

  final publisher = await join('publisher');
  final subscriber = await join('subscriber');
  try {
    // 1. prefix subscription + forwarding
    final received = <RoomMessage<JsonValue>>[];
    subscriber.subscribe('debug:', received.add, const SubscribeOptions(prefix: true));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    publisher.publish('debug:result', const {'ok': true, 'value': 42});
    for (var i = 0; i < 20 && received.isEmpty; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 25));
    }
    expect(received.isNotEmpty &&
        (received.first.payload as Map)['value'] == 42, 'prefix subscriber receives forwarded payload');

    // 2. retain + late waitFor
    publisher.publish('backend:ready', const {'initialized': true},
        const PublishOptions(retain: true));
    final late = await join('late');
    final ready = await late.waitFor('backend:ready', const WaitForOptions(timeout: Duration(seconds: 3)));
    expect((ready.payload as Map)['initialized'] == true, 'late waitFor resolves from retained state');
    late.close();

    // 3. member join event
    var memberJoined = false;
    final memberOff = subscriber.onMember((event, member) {
      if (event == MemberEvent.joined && member.clientName == 'observer') memberJoined = true;
    });
    final observer = await join('observer');
    observer.close();
    for (var i = 0; i < 20 && !memberJoined; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 25));
    }
    expect(memberJoined, 'member join event observed');
    memberOff();

    // 4. logger dual write + subscribeLogs
    final logSeen = <StructuredLog>[];
    final logOff = subscribeLogs(subscriber, (entry, message) => logSeen.add(entry));
    final logger = createLogger(LoggerOptions(client: publisher));
    logger.warn('dart live check', const {'n': 7});
    for (var i = 0; i < 20 && logSeen.isEmpty; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 25));
    }
    expect(logSeen.isNotEmpty && logSeen.first.message == 'dart live check' && logSeen.first.level == LogLevel.warn,
        'subscribeLogs forwards published log entry');
    logOff();

    // 5. collectLogs over HTTP
    final collected = await collectLogs(subscriber, CollectLogsOptions(
      startTime: DateTime.now().subtract(const Duration(minutes: 5)).millisecondsSinceEpoch,
      clientNames: const ['publisher'],
    ));
    expect(collected.any((entry) => entry.message == 'dart live check'), 'collectLogs finds published entry');

    // 6. trace round trip
    final traceId = await saveTrace(publisher, const {'dart': true, 'n': 1});
    final envelope = await getTrace(publisher, traceId);
    expect(envelope.traceId == traceId && (envelope.data as Map)['dart'] == true, 'saveTrace/getTrace round trip');

    // 7. hook with trace store
    var afterRan = false;
    String? hookTraceId;
    final hooked = createHook(
      (int a, int b) => a + b,
      CreateHookOptions(
        client: publisher,
        name: 'addFn',
        captureArgs: true,
        captureResult: true,
        onTraceCreated: (id) => hookTraceId = id,
      ),
    ).after((ctx) => afterRan = true);
    final sum = hooked.applyAs<int>([3, 4]);
    expect(sum == 7 && afterRan, 'createHook wraps and after handler runs');
    for (var i = 0; i < 20 && hookTraceId == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 25));
    }
    final hookTrace = await getTrace(publisher, hookTraceId!);
    final traceData = FunctionTrace.fromJson(hookTrace.data as Map<String, Object?>);
    expect(traceData.name == 'addFn' && traceData.status == 'returned', 'hook trace stored with name');
    expect(traceData.args is Map && (traceData.args as Map).containsKey('args') ||
        traceData.args != null, 'hook trace captured args');

    // 8. REST
    final processes = await listProcesses(subscriber);
    expect(processes.serverId.isNotEmpty && processes.pid > 0, 'listProcesses returns backend view');
    final imported = await importProcessBatch(subscriber, [
      const ImportProcessItem(script: 'echo', args: ['hi'], cwd: '/tmp', name: 'dart-import-test'),
    ]);
    expect(imported.imported.isNotEmpty, 'importProcessBatch imports item');
    final cleared = await clearProcessLogs(subscriber, imported.imported.first.id);
    expect(cleared.id == imported.imported.first.id, 'clearProcessLogs clears imported item');
    try {
      await clearLogs(subscriber); // no processId configured -> must throw
      expect(false, 'clearLogs without process id throws');
    } catch (error) {
      expect(error is ArgumentError, 'clearLogs without process id throws');
    }
    expect((await selectDirectory(subscriber)) == null, 'selectDirectory returns null when canceled');

    // 9. waitFor timeout path
    try {
      await publisher.waitFor('never/published', const WaitForOptions(timeout: Duration(milliseconds: 300)));
      expect(false, 'waitFor timeout throws');
    } catch (error) {
      expect(error is StateError, 'waitFor timeout throws');
    }
  } finally {
    publisher.close();
    subscriber.close();
  }
  print('all $passed live checks passed');
}
