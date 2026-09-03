# HTTP API 变更记录

## 2026-09-03

- `GET /api/processes/:id`：响应新增 `envs` 字段（`Record<string,string> | null`，唯一下发 envs 的端点，供克隆/编辑流程读取）；行为变更——已停止/历史进程不再返回 404，改为返回其持久化记录（与列表可见性一致），仅完全不存在的 id 才 404。
- `POST /api/processes/import`：新增可选 body 字段 `envs`（`Record<string,string>`），创建/覆盖记录时持久化该环境变量；不传或传空对象时保持原行为（覆盖场景保留记录已存的 envs）。新增可选 body 字段 `favorite`（布尔，默认 `true`）；传 `false` 时创建非收藏记录，且不做"同命令收藏去重覆盖"，总是新建（供克隆流程使用，避免克隆收藏进程时覆盖源记录）。

## 2026-09-02

- `POST /api/processes/import`、`POST /api/processes/import-batch`（含 MCP 工具 import 入口）：行为变更——当导入项的命令（`script` + `args` + `cwd`）与现有收藏（favorite）记录完全相同时，覆盖该记录（复用原 id，仅更新 name/desc/group/port 等配置字段，运行状态字段保持不变），不再新增重复记录。请求参数无变化。

## 2026-09-01

- `POST /api/processes/import`：新增可选字段 `port`（整数，1–65535，非法值返回 400），创建的未启动记录会持久化该端口（卡片一键打开链接可用）。之前该端点忽略 `port`。
