# 自动化调试示例

这里提供两个与 `documents/docs/research/automation-testing-strategy.mdx` 对应的可运行示例：

- `single-process/`：一个计数服务，验证 readiness、业务消息、状态快照和结构化日志。
- `multi-process/`：库存服务与订单 worker，验证跨进程启动依赖、消息链、状态和聚合日志。

## 运行

在仓库根目录执行：

```powershell
npm run example:automation:single
npm run example:automation:multi
npm run example:automation
```

前两个命令分别运行单进程或多进程示例，最后一个命令构建一次后顺序运行全部示例。脚本会使用随机端口启动短生命周期的隔离 procm-mcp 后端，不会启动或修改 `7331/7332` 的持久调试服务。

## 输出

成功时，每个验证步骤都会输出 `PASS` 和关键数据，最后输出：

```text
RESULT: PASS | 6/6 validation steps completed
[CLEANUP] PASS | ...已释放
```

任一步骤失败时输出 `RESULT: FAIL`，进程退出码为非零，并仍然执行清理。

## 文件职责

- `_shared.mjs`：统一输出、断言、进程启动/删除和条件等待。
- `single-process/service.mjs`：单个被测业务进程。
- `single-process/run.mjs`：单进程测试驱动。
- `multi-process/inventory.mjs`：库存业务进程。
- `multi-process/worker.mjs`：依赖库存 readiness 的订单业务进程。
- `multi-process/run.mjs`：多进程联合测试驱动。

`executeCustom()` 会在目标进程执行函数源码，本示例仅用于本地、受信任的测试环境。
