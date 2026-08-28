# 文件地图

```
packages/procm-sdk/
├── package.json            # @hunmer/procm-mcp-sdk · ESM only · files:["dist"] · node>=22
├── tsconfig.json           # tsc -p 构建（declaration + sourcemap）
├── src/
│   ├── index.ts            # ★ 包唯一出口：全量 re-export
│   ├── protocol.ts         # ★ wire 协议 v1：帧类型/校验/marker 编解码/matchesTopic
│   ├── client.ts           # ★ ProcmClient：连接/订阅/发布/waitFor/重连/心跳/token/trace请求
│   ├── logger.ts           # createLogger：console + $procm/log 双写
│   ├── custom-execution.ts # exposeCustomExecution / executeCustom（eval RPC）
│   ├── trace.ts            # saveTrace：校验/重试/超时/abort
│   ├── hook.ts             # createHook / hookProperty：拦截 + FunctionTrace
│   └── rest.ts             # REST 封装：clearProcessLogs / clearLogs / importProcessBatch / selectDirectory
└── dist/                   # 构建产物（随仓库提交，改 src 后必须重新 build）
    ├── *.js / *.js.map
    └── *.d.ts / *.d.ts.map
```

## 定位速查

| 要找 | 去哪 |
|---|---|
| 协议帧结构/加新帧 | `src/protocol.ts` |
| 重连/心跳/token 逻辑 | `src/client.ts` |
| 日志 marker 格式 | `src/protocol.ts`（encode/decode）+ `src/logger.ts` |
| 函数拦截/调用链 | `src/hook.ts` |
| trace 大小/TTL 限制 | `src/trace.ts`（常量） |
| 远程执行 RPC | `src/custom-execution.ts` |
| REST 封装（清日志/批量导入/目录选择） | `src/rest.ts` |
| 消费示例 | `demo/node-server/`、`demo/electron-client/`、根 `README.md` |
