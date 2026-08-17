# API Changes

## 2026-08-17

- 扩展 `GET /api/rooms/:roomId/logs` 查询参数：`startTime`、`endTime`（Unix 毫秒，均为包含边界）。用于 SDK `collectLogs()` 按时间窗口读取结构化日志。

## 2026-08-17

- 新增 `DELETE /api/processes/:id/logs`
  - 请求 body：无
  - 响应 200：`{ "id": string, "cleared": true }`
  - 响应 404：`{ "error": "Process not found" }`
  - 说明：将指定进程的 stdout、stderr 内存历史及对应日志文件清空为空文本；运行中的进程会继续记录清空后产生的新日志。

## 2026-08-15

- 新增 `POST /api/processes/import-batch`
  - 请求 body：`{ "items": [{ "script": string, "args": string[], "cwd": string, "name"?: string, "desc"?: string }], "group"?: string }`
  - 响应 201：`{ "imported": [{ "id": string, "name": string, "favorite": boolean }] }`（按输入顺序）
  - 响应 400：`{ "error": string }`（items 为空，或某项缺 script/cwd/args；整体校验，任一项不合法则不写入任何记录）
  - 说明：目录导入的批量版本，一次请求导入整批收藏记录；`group` 应用于每一项。

- 新增 `POST /api/select-directory`
  - 请求 body（可选）：`{ "title": string }`（原生选择框标题）
  - 响应 200：`{ "canceled": boolean, "path": string | null }`（用户取消时 `canceled: true, path: null`）
  - 响应 500：`{ "error": string }`（选择器无法弹出等错误）
  - 说明：通过 `native-file-dialog`（Rust 原生模块，Windows/macOS）弹出系统原生目录选择器，供 dashboard「从目录导入」使用；同步阻塞直到用户选择。原 `popups-file-dialog` 方案在 Windows 上 CLI 无输出，已移除。
