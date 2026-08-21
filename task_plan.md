# Task Plan

## Goal

在已有方案文档基础上，新增单进程与多进程联合调试的可运行 example，并提供清晰验证输出。

## Phases

- [complete] 1. 盘点现有测试脚本、SDK 能力和已有文档
- [complete] 2. 核验单进程与多进程执行链、能力边界
- [complete] 3. 编写研究文档并接入 Research 侧边栏
- [complete] 4. 校验文档内容、链接与仓库状态
- [complete] 5. 设计 example 目录与运行协议
- [complete] 6. 实现单进程和多进程示例
- [complete] 7. 运行示例并修复问题
- [complete] 8. 更新文档入口并完成静态校验

## Constraints

- 结论必须能由当前源码或测试脚本证明。
- 不修改 HTTP API；无需更新 `api-changes.md`。
- 不启动项目服务，除非验证明确需要。
- 文档以“被测业务进程数量”区分单进程/多进程；procm 后端和测试驱动不计入业务进程。
- example 使用随机端口和临时数据目录，自行清理，不创建常驻服务。
- 运行器以 `tests/_helpers.mjs` 为现有隔离后端基础，避免重复实现进程管理。

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| 规划状态补丁上下文不匹配 | 1 | 读取当前文件后按实际内容精确更新 |
| `node --check` 不识别 `.ts` 扩展 | 1 | 改为通过 stdin 按 ESM 语法检查 |
| 单进程示例等待 `counter:result` 超时 | 1 | ready 延后到订阅重放后的 microtask，并增加失败日志输出 |
