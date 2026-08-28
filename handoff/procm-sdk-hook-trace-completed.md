# procm SDK Hook + Trace 完成报告

## 当前状态

功能已经实现并通过完整默认测试。原始方案中的 Redis 已根据最终需求替换为当前 procm-mcp 进程内的 `lru-cache`，因为实际只使用同一实例提供的 HTTP Stream MCP，不需要跨进程共享 Trace。

原始计划及方案变更说明见：`.zcode/plans/procm-sdk-hook-redis-trace-plan.md`。

## 已实现功能

- SDK 支持同步函数和 Promise 函数 Hook，保留 `this`、同步返回类型和原始异常对象。
- `before` 支持修改参数和跳过原函数，`after` 支持修改结果。
- 支持 configurable 自有属性的 get/set Hook，并提供幂等恢复函数。
- 自动生成 `traceId`，采集运行时调用链、文件、行列、耗时和最终状态。
- SDK 通过现有 `/room` WebSocket 提交 Trace，并处理确认、超时、Abort、断线和并发请求。
- Logger 和 `room-logs` 支持可选 `traceId`，不增加额外控制台输出。
- `trace-get` 已注册到 HTTP Stream MCP；同一 procm-mcp 实例可以按 ID 读取完整 Trace。
- Trace 使用 64 MiB 有界 LRU，单条最大 256 KiB，默认 TTL 24 小时，可用 `PROCM_TRACE_TTL_SECONDS` 调整。
- Trace 在进程重启、TTL 到期或 LRU 淘汰后丢失，不在不同 procm-mcp 实例间共享。

主要实现位置：

- `packages/procm-sdk/src/hook.ts`
- `packages/procm-sdk/src/trace.ts`
- `packages/procm-sdk/src/client.ts`
- `src/trace-store.ts`
- `src/room-hub.ts`
- `src/tools/trace.ts`
- `README.md`

## 验收结果

已执行并通过：

```bash
npm run build
npm test
```

结果：10 个测试套件全部通过，0 失败。内存 Trace 端到端测试为 32/32 通过，覆盖同实例 HTTP 保存/读取、20 并发、TTL、冲突、大小限制、非法请求、Hook 状态以及 timeout/Abort 清理。

单独验收 Trace：

```bash
npm run test:trace
```

关键测试见：

- `tests/sdk-hook.mjs`
- `tests/trace-logger.mjs`
- `tests/trace-memory.mjs`

## 后续可优化建议

1. 将 64 MiB LRU 总容量变为可选环境变量，并设置合理范围校验。
2. 增加采样率、最小耗时阈值和自定义脱敏函数，降低高频 Hook 的内存与序列化成本。
3. 支持 source map，将运行时 JavaScript 位置映射回 TypeScript 源码。
4. 如未来重新需要跨实例或重启保留，再引入可插拔持久化接口，不要直接耦合具体数据库。
5. Dashboard 后续可根据结构化日志中的 `traceId` 提供 Trace 详情入口。

## Suggested Skills

- `procm-mcp`：下一会话需要启动、重启 HTTP 后端或读取服务日志时使用；操作前同时遵循仓库 `debug.md`。
- `handoff`：下一次继续交接时，用于生成新的精简上下文文档。

## 继续工作前检查

1. 阅读仓库根目录 `AGENTS.md` 和 `debug.md`。
2. 查看 `git status --short`，保留当前未提交改动。
3. 修改 Trace 行为后至少执行 `npm run test:trace`；涉及共享协议时执行完整 `npm test`。
