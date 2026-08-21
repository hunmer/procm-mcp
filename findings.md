# Findings

## Confirmed

- CodeGraph 定位到 `packages/procm-sdk/src/client.ts` 的 `subscribe()` 与 `waitFor()`。
- `waitFor()` 支持精确/前缀主题、payload 过滤、超时和 `AbortSignal` 取消。
- `packages/procm-sdk/src/logger.ts` 提供 `setupLogger()`、`setupLoggerFromEnv()`、`subscribeLogs()` 和 `collectLogs()`。
- `setupLoggerFromEnv()` 有房间环境变量时自动创建客户端；没有时仍输出本地结构化控制台日志。
- `subscribeLogs()` 用于实时日志断言；`collectLogs()` 通过房间 HTTP 日志接口补收调用前已落盘的历史日志，并支持时间、级别、client/member 过滤。
- Logger 同时写可读控制台文本和结构化帧；房间连接打开时还发布到 `$procm/log`。
- `procm-rooms` 技能资料指出还支持保留消息、房间日志合并及批量进程操作；仍需以测试脚本复核。
- 测试总入口为 `tests/run-all.mjs`；SDK/协同相关脚本包括 `room-sdk.mjs`、`trace-logger.mjs`、`sdk-hook.mjs`、`trace-memory.mjs`、`log-clear-notification.mjs`。
- `demo/custom-execution-test.mjs` 是面向自定义执行与结果回传的示范测试脚本。
- 根 `package.json` 的 `npm test` 会先完整 build，再串行执行 `tests/run-all.mjs` 中 13 个套件；每套使用独立临时 `PROCM_MCP_DIR`。
- `tests/room-sdk.mjs` 实测 prefix 订阅、retain + late `waitFor`、`correlationId` 往返、自定义执行、进程 restart 保留 roomId、结构化日志查询及 batch best-effort 逐项结果。
- `demo/custom-execution-test.mjs` 在同一房间内读取 backend 进程数据、校验 HTTP 页面，并通过 backend API 间接读取 Electron renderer 状态。
- SDK 还支持 `createHook`/`hookProperty`、`saveTrace`/`getTrace`：可观察调用链、参数/返回/异常；trace 位于当前 procm 实例内存，重启清空、跨实例不共享。
- `custom-execution` 会在目标端 eval 函数源码，仅适用于完全受信任的本地房间。
- SDK package 自身无 test script；实际覆盖集中在根 `tests/`，SDK build 只做 TypeScript 编译。
- SDK 要求 Node.js >= 22。
- `tests/_helpers.mjs` 提供无框架测试基建：随机端口启动独立后端、HTTP/MCP 调用、轮询就绪、断言汇总和清理。
- `tests/noisy-custom-execution.mjs` 启动两个同 room 的托管进程，分别通过 `executeCustom()` 定向读取/调用上下文，并验证高噪音 stdout 不会混入 RPC 结果。
- 手工依赖型测试（如 `log-clear-notification.mjs`）明确绑定 test backend，不属于 `run-all`；自动方案应区分“自包含回归”与“持久环境验收”。
- 项目存在 `procm-commands.json`，需核对是否已有可复用的多进程启动编排。
- `procm-commands.json` 已定义 procm backend、dashboard、demo Node backend、demo Electron 的持久命令，可作为人工验收环境。
- demo backend 在 SDK open 后暴露 `backend` custom execution，并 retain 发布 `backend:ready`；Electron main 暴露 `frontend` custom execution，通过 `waitFor("backend:ready")` 协调启动。
- demo 请求/响应使用 `correlationId` 关联；两端均可通过 Logger + hook trace 提供可查询诊断证据。
- 当前 SDK 的公开源码签名确认存在 `collectLogs`、`subscribeLogs`、`saveTrace`、`getTrace`、`executeCustom`、`exposeCustomExecution`、`createHook`、`hookProperty`。

## Pending

- 无。

## Example Design

- 目录：`examples/automation-testing/{single-process,multi-process}`，另设 `_shared.mjs` 和 README。
- 单进程：counter service retained 发布 ready，处理带 correlationId 的 add 请求，暴露 snapshot。
- 多进程：inventory + worker 同房间；worker 等 inventory ready 后再发布自身 ready，端到端完成订单。
- runner 输出编号 PASS/FAIL，验证业务结果、custom execution 状态、结构化日志，并在 finally 清理。
- 根命令：`example:automation:single`、`example:automation:multi`、`example:automation`。
- 示例只创建短生命周期随机端口后端，验证期间不操作持久化 `7331/7332` 服务。
- 首次运行暴露 SDK welcome 时序：`setState("open")` 先触发回调，之后才重放预注册订阅；ready 需延后到 microtask，保证“ready”确实代表订阅可用。
- runner 失败时会在清理前打印所有被测进程最近 30 行 stdout/stderr。
- 单进程实际运行 6/6 通过，结构化日志可在默认 5 秒轮询窗口内稳定回收。
- 多进程实际运行 6/6 通过，retained 启动依赖、三段消息链、两个状态快照和跨进程日志均一致。
- 组合命令 `npm run example:automation` 构建一次并顺序运行两个示例，12/12 验证及两次 cleanup 全部通过。
- 最终工作区只包含预期的 package script、documents、examples 和研究记录；构建未产生额外 tracked 改动。
