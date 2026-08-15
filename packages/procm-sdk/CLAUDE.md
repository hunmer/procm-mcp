# @procm-mcp/sdk

procm-mcp 房间系统的 TypeScript 客户端 SDK（独立 npm 包，workspace 成员）。四块能力：`ProcmClient` WebSocket 房间消息（订阅/retain 发布/waitFor/自动重连）、`createLogger` 结构化日志（console + `$procm/log` 双写，base64url marker）、`createHook`/`saveTrace` 函数追踪（调用链 + 后端内存 LRU 存储，经 `trace-get` 工具读取）、`exposeCustomExecution`/`executeCustom` 远程函数执行 RPC。纯库无进程，浏览器与 Node（≥22）通用，运行时依赖仅 `callsites`。

## 约定（高优先级）

- 改 `src/` 后必须 `npm run build`（本目录，`tsc -p`）——消费方（后端 `src/`、dashboard、demo）用的是 `dist/`；根 `npm run build` 会先自动跑 `build:sdk`。
- **`dist/` 随仓库提交**：改源不重编会提交脱节的产物。
- 源码 import **必须带 `.js` 后缀**（ESM/Node16，同根项目）。
- **`custom-execution` 是 `eval` 远程求值**——只允许在完全信任的本地 room 暴露；不要把它接入不受信网络。
- 新公共导出必须加进 `src/index.ts`（包唯一出口）。
- `before`/`after` hook 处理器必须同步（返回 Promise 会抛错）。

详见 [claude/conventions.md](claude/conventions.md)。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [claude/overview.md](claude/overview.md) | 四块能力、运行形态、设计取舍 | 第一次理解 SDK 时 |
| [claude/conventions.md](claude/conventions.md) | 命令、风格、安全红线 | 改代码前 |
| [claude/module-responsibilities.md](claude/module-responsibilities.md) | 7 个源文件职责与分层 | 定位实现时 |
| [claude/entrypoints.md](claude/entrypoints.md) | 包出口、接入流程、构建 | 理解初始化时 |
| [claude/public-interfaces.md](claude/public-interfaces.md) | 全部公共 API 摘要 | 对接 SDK 时 |
| [claude/dependencies-and-config.md](claude/dependencies-and-config.md) | 依赖、环境变量、workspace 关系 | 排查接入问题时 |
| [claude/data-model.md](claude/data-model.md) | wire 帧、领域类型、限流常量 | 改协议/hook/trace 时 |
| [claude/testing-and-quality.md](claude/testing-and-quality.md) | 包内零测试 + 根 tests/ 覆盖映射 | 评估质量时 |
| [claude/file-map.md](claude/file-map.md) | 目录树 + 定位速查 | 找文件时 |
| [claude/faq.md](claude/faq.md) | 常见问题与定位 | 踩坑时 |
| [claude/changelog.md](claude/changelog.md) | 本索引的生成/更新记录 | 查文档版本时 |

## 扫描状态

- **更新时间**：2026-08-15
- **已扫描**：`src/` 全部 7 文件（100% 逐行）、`package.json`、`tsconfig.json`；`dist/` 抽查（与 src 同构）；消费方（根 `src/room-hub.ts`、`tests/room-sdk.mjs` 等）在根索引覆盖。
- **跳过**：`dist/*.map`（产物）。
- **下一步建议**：补包内单元测试（protocol 编解码、waitFor 竞态）；`custom-execution` 增加目标端opt-in 白名单开关。
