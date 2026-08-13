# 文件定位速查

```
procm-mcp/
├── src/
│   ├── index.ts              # 入口/分流/信号处理（注册 5 个 stdio 工具）
│   ├── cli-client.ts         # HTTP 客户端（ps/info/logs/grep/start/restart/stop/ping）
│   ├── process-manager.ts    # ★ 进程生命周期核心（spawn/kill/restart/persist/输入/回收）
│   ├── process-stdout-client.ts  # 每流捕获：2000 行环形缓冲 + .log 双写 + tail/grep
│   ├── processes-repository.ts   # lowdb 持久化历史 processes.json
│   ├── events.ts             # 进程内事件总线（burst 合并）
│   ├── websocket-server.ts   # /ws 实时推送（processes + log）
│   ├── http-server.ts        # REST + dashboard + /mcp 委托 + WS 挂载（127.0.0.1）
│   ├── mcp-http.ts           # /mcp stateless，注册 4 工具（无 process-input）
│   ├── dashboard-html.ts     # 托管 dashboard/dist 静态包
│   ├── project-scanner.ts    # 项目清单扫描 → favorites 候选
│   ├── server-log.ts         # serverId(nanoid) + 日志包装
│   ├── server-dir.ts         # <serverId> 子目录
│   ├── procm-mcp-dir.ts      # <tmpdir>/procm-mcp 根
│   ├── logger.ts             # 写 debug.log
│   ├── tool-helpers.ts       # textResult / notFoundResult
│   ├── error.ts              # toErrorMessage
│   ├── types.ts              # ProcessStatus / ProcessMetadata
│   ├── sleep.ts
│   └── tools/
│       ├── process.ts        # start-process / process(get/delete/restart/list)
│       ├── process-logs.ts   # process-logs(tail/grep)
│       ├── process-input.ts  # process-input(stdin/signal，stdio 限定)
│       └── procm-commands.ts # procm-command(list/start)
├── tests/                    # 5 套（run-all）+ ws-livecheck + _helpers + example-process.js
├── build/                    # tsc 产物，入口 build/index.js（勿手改；删源后需 clean 重建防孤儿）
├── dashboard/                # 独立 React+Vite 工程，见 dashboard/CLAUDE.md
├── scripts/                  # link-global.mjs 等
├── package.json              # scripts/files：发布 ["build","dashboard/dist"]
├── tsconfig.json             # ESM/Node16，import 需 .js 后缀
└── .mcp.json / server.json   # MCP 配置/元数据
```

**关键定位**

| 要找 | 去哪 |
|---|---|
| 进程生命周期/spawn/persist | `src/process-manager.ts` |
| 日志捕获/tail/grep | `src/process-stdout-client.ts` |
| REST 路由 | `src/http-server.ts` |
| MCP 工具注册（stdio / HTTP） | `src/index.ts` / `src/mcp-http.ts` |
| `/mcp` 传输 | `src/mcp-http.ts` |
| `/ws` 推送 | `src/websocket-server.ts` + `src/events.ts` |
| 命令重建（粘贴运行） | `http-server.ts` `buildCommand` |
| 允许发送的信号枚举 | `process-manager.ts` `ALLOWED_INPUT_SIGNALS` |
