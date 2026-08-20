# API Changes

## 2026-08-18

- `PATCH /api/processes/:id`：请求体新增可选字段 `group`（`string | null`）。传入非空字符串将该进程移动到对应分组（不存在则创建），传 `null` 或空字符串移回未分组；与其它字段一样按需合并，不传则保持不变。

## 2026-08-20

- `GET /api/meta`、`GET /api/processes`：响应新增字段 `port`（`number | null`），为后端 HTTP 服务的实际监听端口；stdio-only 或未启动 HTTP 服务时为 `null`。
- WebSocket `/ws` 的 `processes` 消息：新增字段 `port`（`number | null`），含义同上。
