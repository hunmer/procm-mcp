import 'dart:convert';

import 'package:http/http.dart' as http;

import 'client.dart';

({String base, String? token}) _httpBase(ProcmClient client) {
  final target = client.connectionTarget;
  if (target.url.isEmpty) throw StateError('procm HTTP URL is required');
  return (
    base: target.url
        .replaceFirstMapped(RegExp(r'^ws(s?)://'), (match) => 'http${match[1]}://')
        .replaceFirst(RegExp(r'/room/?$'), ''),
    token: target.token,
  );
}

Future<Map<String, Object?>?> _request(
  ProcmClient client,
  String method,
  String path, [
  Object? body,
]) async {
  final (:base, :token) = _httpBase(client);
  final request = http.Request(method, Uri.parse('$base$path'));
  if (token != null) request.headers['Authorization'] = 'Bearer $token';
  if (body != null) {
    request.headers['Content-Type'] = 'application/json';
    request.body = jsonEncode(body);
  }
  final streamed = await request.send();
  final text = await streamed.stream.bytesToString();
  final payload = text.isEmpty ? null : jsonDecode(text);
  if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
    final error =
        payload is Map && payload['error'] is String ? payload['error'] as String : null;
    throw StateError(error ?? 'HTTP ${streamed.statusCode}');
  }
  return payload is Map ? payload.cast<String, Object?>() : null;
}

class ImportProcessItem {
  const ImportProcessItem({
    required this.script,
    required this.args,
    required this.cwd,
    this.name,
    this.desc,
  });

  final String script;
  final List<String> args;
  final String cwd;
  final String? name;
  final String? desc;

  Map<String, Object?> toJson() => {
        'script': script,
        'args': args,
        'cwd': cwd,
        if (name != null) 'name': name,
        if (desc != null) 'desc': desc,
      };
}

enum ProcessStatus { spawning, running, exited, error }

ProcessStatus _parseProcessStatus(String? value) => switch (value) {
      'spawning' => ProcessStatus.spawning,
      'exited' => ProcessStatus.exited,
      'error' => ProcessStatus.error,
      _ => ProcessStatus.running,
    };

class ProcessView {
  const ProcessView({
    required this.id,
    required this.name,
    required this.script,
    required this.args,
    required this.cwd,
    required this.status,
    required this.pid,
    required this.exitCode,
    required this.error,
    this.desc,
    this.group,
    this.port,
    this.roomId,
    this.startedAt,
    this.lastStartedAt,
    this.stoppedAt,
    this.favorite,
  });

  factory ProcessView.fromJson(Map<String, Object?> json) => ProcessView(
        id: json['id'] as String,
        name: json['name'] as String,
        script: json['script'] as String,
        args: (json['args'] as List).cast<String>(),
        cwd: json['cwd'] as String,
        status: _parseProcessStatus(json['status'] as String?),
        pid: json['pid'] as int?,
        exitCode: json['exitCode'] as int?,
        error: json['error'] as String?,
        desc: json['desc'] as String?,
        group: json['group'] as String?,
        port: json['port'] as int?,
        roomId: json['roomId'] as String?,
        startedAt: json['startedAt'] as int?,
        lastStartedAt: json['lastStartedAt'] as int?,
        stoppedAt: json['stoppedAt'] as int?,
        favorite: json['favorite'] as bool?,
      );

  final String id;
  final String name;
  final String script;
  final List<String> args;
  final String cwd;
  final ProcessStatus status;
  final int? pid;
  final int? exitCode;
  final String? error;
  final String? desc;
  final String? group;
  final int? port;
  final String? roomId;
  final int? startedAt;
  final int? lastStartedAt;
  final int? stoppedAt;
  final bool? favorite;
}

class ProcessListResponse {
  const ProcessListResponse({
    required this.serverId,
    required this.pid,
    this.startedAt,
    this.port,
    required this.processes,
  });

  factory ProcessListResponse.fromJson(Map<String, Object?> json) => ProcessListResponse(
        serverId: json['serverId'] as String,
        pid: (json['pid'] as num).toInt(),
        startedAt: json['startedAt'] as int?,
        port: json['port'] as int?,
        processes: (json['processes'] as List)
            .whereType<Map>()
            .map((item) => ProcessView.fromJson(item.cast<String, Object?>()))
            .toList(),
      );

  final String serverId;
  final int pid;
  final int? startedAt;
  final int? port;
  final List<ProcessView> processes;
}

class UpdateProcessBody {
  const UpdateProcessBody({
    this.name,
    this.script,
    this.args,
    this.cwd,
    this.desc,
    this.port,
    this.envs,
    this.group,
  });

  final String? name;
  final String? script;
  final List<String>? args;
  final String? cwd;
  final String? desc;
  final int? port;
  final Map<String, String>? envs;
  final String? group;

  Map<String, Object?> toJson() => {
        if (name != null) 'name': name,
        if (script != null) 'script': script,
        if (args != null) 'args': args,
        if (cwd != null) 'cwd': cwd,
        if (desc != null) 'desc': desc,
        if (port != null) 'port': port,
        if (envs != null) 'envs': envs,
        if (group != null) 'group': group,
      };
}

class ServerLogFile {
  const ServerLogFile({
    required this.name,
    required this.path,
    required this.size,
    required this.modifiedAt,
  });

  factory ServerLogFile.fromJson(Map<String, Object?> json) => ServerLogFile(
        name: json['name'] as String,
        path: json['path'] as String,
        size: (json['size'] as num).toInt(),
        modifiedAt: (json['modifiedAt'] as num).toInt(),
      );

  final String name;
  final String path;
  final int size;
  final int modifiedAt;
}

class ServerLogInfo {
  const ServerLogInfo({
    required this.dir,
    required this.maxBytes,
    required this.defaultMaxBytes,
    required this.envMaxBytes,
    required this.files,
  });

  factory ServerLogInfo.fromJson(Map<String, Object?> json) => ServerLogInfo(
        dir: json['dir'] as String,
        maxBytes: (json['maxBytes'] as num).toInt(),
        defaultMaxBytes: (json['defaultMaxBytes'] as num).toInt(),
        envMaxBytes: json['envMaxBytes'] as int?,
        files: (json['files'] as List)
            .whereType<Map>()
            .map((item) => ServerLogFile.fromJson(item.cast<String, Object?>()))
            .toList(),
      );

  final String dir;
  final int maxBytes;
  final int defaultMaxBytes;
  final int? envMaxBytes;
  final List<ServerLogFile> files;
}

class ClearProcessLogsResult {
  const ClearProcessLogsResult({required this.id});

  factory ClearProcessLogsResult.fromJson(Map<String, Object?> json) =>
      ClearProcessLogsResult(id: json['id'] as String);

  final String id;
}

class ImportBatchResult {
  const ImportBatchResult({required this.imported});

  factory ImportBatchResult.fromJson(Map<String, Object?> json) => ImportBatchResult(
        imported: (json['imported'] as List)
            .whereType<Map>()
            .map((item) => ImportedProcess.fromJson(item.cast<String, Object?>()))
            .toList(),
      );

  final List<ImportedProcess> imported;
}

class ImportedProcess {
  const ImportedProcess({required this.id, required this.name, required this.favorite});

  factory ImportedProcess.fromJson(Map<String, Object?> json) => ImportedProcess(
        id: json['id'] as String,
        name: json['name'] as String,
        favorite: json['favorite'] as bool? ?? false,
      );

  final String id;
  final String name;
  final bool favorite;
}

Future<ProcessListResponse> listProcesses(ProcmClient client) async =>
    ProcessListResponse.fromJson((await _request(client, 'GET', '/api/processes'))!);

Future<ProcessView> getProcess(ProcmClient client, String id) async =>
    ProcessView.fromJson(
        (await _request(client, 'GET', '/api/processes/${Uri.encodeComponent(id)}'))!);

Future<ProcessView> updateProcess(
  ProcmClient client,
  String id,
  UpdateProcessBody updates,
) async =>
    ProcessView.fromJson((await _request(
      client,
      'PATCH',
      '/api/processes/${Uri.encodeComponent(id)}',
      updates.toJson(),
    ))!);

Future<ServerLogInfo> getServerLogInfo(ProcmClient client) async =>
    ServerLogInfo.fromJson((await _request(client, 'GET', '/api/server-log'))!);

Future<ServerLogInfo> updateServerLogMaxBytes(
  ProcmClient client,
  int? maxBytes,
) async =>
    ServerLogInfo.fromJson(
        (await _request(client, 'PUT', '/api/server-log/settings', {'maxBytes': maxBytes}))!);

Future<List<String>> clearServerLogs(ProcmClient client) async =>
    ((await _request(client, 'DELETE', '/api/server-log'))!['cleared'] as List)
        .cast<String>();

Future<ClearProcessLogsResult> clearProcessLogs(ProcmClient client, String id) async =>
    ClearProcessLogsResult.fromJson(
        (await _request(client, 'DELETE', '/api/processes/${Uri.encodeComponent(id)}/logs'))!);

Future<void> killSystemProcess(ProcmClient client, int pid, {bool tree = true}) async {
  await _request(client, 'POST', '/api/system-processes/$pid/kill${tree ? '' : '?tree=0'}');
}

/// Clears logs for the process represented by [client].
Future<ClearProcessLogsResult> clearLogs(
  ProcmClient client, [
  String? id,
]) {
  id ??= client.processId;
  if (id == null) throw ArgumentError('process id is required to clear logs');
  return clearProcessLogs(client, id);
}

Future<ImportBatchResult> importProcessBatch(
  ProcmClient client,
  List<ImportProcessItem> items, [
  String? group,
]) async {
  if (items.isEmpty) throw ArgumentError('items must be a non-empty array');
  return ImportBatchResult.fromJson((await _request(
    client,
    'POST',
    '/api/processes/import-batch',
    {
      'items': items.map((item) => item.toJson()).toList(),
      if (group != null) 'group': group,
    },
  ))!);
}

/// Alias of [importProcessBatch], mirroring the TS SDK.
final batchImportProcesses = importProcessBatch;

/// Opens the backend's native directory picker; null when canceled.
Future<String?> selectDirectory(ProcmClient client, [String? title]) async {
  final result = await _request(client, 'POST', '/api/select-directory',
      title == null ? <String, Object?>{} : {'title': title});
  final canceled = result?['canceled'] as bool? ?? true;
  return canceled ? null : result?['path'] as String?;
}
