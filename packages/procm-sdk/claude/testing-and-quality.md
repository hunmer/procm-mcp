# 测试与质量

## 包内测试

**无**。`packages/procm-sdk` 自身没有 test 脚本；质量门禁 = `tsc` 编译通过（build 即类型检查）。

## 实际覆盖（根仓库 `tests/`，跑法见根 CLAUDE.md）

| 套件 | 覆盖的 SDK 面 |
|---|---|
| `tests/room-sdk.mjs` | client 订阅/发布/waitFor/成员事件、retain、room REST |
| `tests/sdk-hook.mjs` | createHook 拦截语义、trace 存取往返（含 `tests/fixtures/hook-target.mjs`） |
| `tests/trace-logger.mjs` | Logger marker 编码、后端 room-logs 还原 |
| `tests/trace-memory.mjs` | trace:put LRU/TTL/超限错误码、trace-get 工具读取 |

跑法：根目录 `npm test`（run-all 10 套含上述 4 套）或单套 `node tests/<name>.mjs`（需先 `npm run build`）。

## 风险

- `custom-execution` 的 `eval` 求值路径无沙箱、无鉴权隔离（只受 room token 保护）——文档层面约束"仅信任环境"。
- `waitFor`/trace 的 AbortSignal 在 Node ≥22 假定可用；低版本未声明支持（engines 已挡）。
- 浏览器端只测过 dashboard 间接使用（`lib/api.ts` 的 decode 函数），无独立浏览器测试。
