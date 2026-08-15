# API Changes

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
  - 说明：通过 `popups-file-dialog`（tinyfiledialogs）弹出系统原生目录选择器，供 dashboard「从目录导入」使用；Windows/Linux 可用，macOS 上游尚未构建。
