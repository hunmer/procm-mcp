# HTTP API 变更记录

## 2026-09-02

- `POST /api/processes/import`、`POST /api/processes/import-batch`（含 MCP 工具 import 入口）：行为变更——当导入项的命令（`script` + `args` + `cwd`）与现有收藏（favorite）记录完全相同时，覆盖该记录（复用原 id，仅更新 name/desc/group/port 等配置字段，运行状态字段保持不变），不再新增重复记录。请求参数无变化。

## 2026-09-01

- `POST /api/processes/import`：新增可选字段 `port`（整数，1–65535，非法值返回 400），创建的未启动记录会持久化该端口（卡片一键打开链接可用）。之前该端点忽略 `port`。
