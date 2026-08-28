# API Changes

## 2026-08-18

- `PATCH /api/processes/:id`：请求体新增可选字段 `group`（`string | null`）。传入非空字符串将该进程移动到对应分组（不存在则创建），传 `null` 或空字符串移回未分组；与其它字段一样按需合并，不传则保持不变。

## 2026-08-20

- `GET /api/meta`、`GET /api/processes`：响应新增字段 `port`（`number | null`），为后端 HTTP 服务的实际监听端口；stdio-only 或未启动 HTTP 服务时为 `null`。
- WebSocket `/ws` 的 `processes` 消息：新增字段 `port`（`number | null`），含义同上。

## 2026-08-28

- 移除 `GET /api/meta`。原 `{serverId, pid, cwd, startedAt, port}` 中除 `cwd` 外的字段本就由 `GET /api/processes`（`{serverId, pid, startedAt, port, processes}`）提供，dashboard 前端 presets 快填移除后已无消费方；Playground 目录与 `tests/log-clear-notification.mjs` 已改用 `GET /api/processes`。

## 2026-08-25

- 新增 `GET /api/server-log`：返回服务端调试日志状态 `{ dir, maxBytes, defaultMaxBytes, envMaxBytes, files: [{ name, path, size, modifiedAt }] }`。`dir` 为数据根目录绝对路径；`maxBytes` 生效优先级：持久化设置（`settings.json`）> env `PROCM_DEBUG_LOG_MAX_BYTES` > 默认 20MB；`files` 为数据目录下所有 `debug.log`。
- 新增 `PUT /api/server-log/settings`：请求体 `{ maxBytes?: number | null }`，设置（正整数字节）或清除（`null`，回退 env/默认值）持久化的 debug.log 大小上限，立即生效；返回与 `GET /api/server-log` 相同的结构（含 `dir`）。非法值返回 400。
- `DELETE /api/server-log`：删除数据目录下所有 server 日志文件夹（`debug.log` + `processes/` 进程日志）；当前实例目录因运行中进程持有文件句柄改为原地清空。返回 `{ cleared: string[] }`（处理的文件夹名）。
