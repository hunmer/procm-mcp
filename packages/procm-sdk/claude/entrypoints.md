# 入口与启动流程

## 包出口

- `package.json` `exports["."]`：`types: dist/index.d.ts`，`import: dist/index.js`（仅 ESM 条目，无 CJS）。
- `src/index.ts` 依次 `export *` protocol → client → logger → custom-execution → trace → hook。**新模块必须加进这里**才会成为公共 API。

## 典型接入流程（消费方视角）

1. `createProcmClient({ clientName })` — 构造即 `queueMicrotask(connect)`；托管进程环境下 roomId/WS URL/token 自动来自环境变量（`PROCM_ROOM_ID`/`PROCM_WS_URL`/`PROCM_HTTP_TOKEN` 等），显式 options 优先。
2. 监听 `onState(state => ...)` 等 `"open"`（welcome 帧后置 open，订阅自动重放）。
3. `subscribe`/`publish`/`waitFor` 收发；`createLogger` 打结构化日志；`createHook` + `saveTrace` 上报追踪。
4. `close()` 释放：停心跳/重连定时器、reject 全部挂起 trace 请求、状态置 closed。

## 构建流程

`tsc -p tsconfig.json` 单步出 `dist/`（JS + d.ts + sourcemap）。无 bundler、无测试步骤、无 watch 脚本。

## 运行时初始化要点

- 构造函数在**缺 roomId 时同步抛错**（`"procm roomId is required"`）；连接缺 URL 在 `connect()` 抛（默认经 microtask 变 unhandled rejection，需 `onState` 或 try/catch 包 `connect`）。
- `memberId` 默认：有 processId 时 `<processId>:<clientName>`，否则 `<clientName>:<随机id>`（重连/重启会变；后端按 `memberId` 判定 replaced 事件）。
