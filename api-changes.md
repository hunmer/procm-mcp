# API Changes

## 2026-08-18

- `PATCH /api/processes/:id`：请求体新增可选字段 `group`（`string | null`）。传入非空字符串将该进程移动到对应分组（不存在则创建），传 `null` 或空字符串移回未分组；与其它字段一样按需合并，不传则保持不变。
