# 文件定位速查

```
procm-mcp/
├── src/
│   ├── index.ts              # 入口/分流/信号处理（注册 8 组 14 个 stdio 工具；--data-path）
│   ├── cli-client.ts         # HTTP 客户端（ps/info/logs/grep/start/edit/import/import-batch/clear-logs/clear-process-logs/select-directory/restart/stop/ping/mcptool）
│   ├── process-manager.ts    # ★ 进程生命周期核心（spawn/kill/restart/persist/输入/回收/resolveSpawnTarget）
│   ├── process-stdout-client.ts  # 每流捕获：2000 行环形缓冲 + .log 双写 + tail/grep
│   ├── processes-repository.ts   # lowdb 持久化历史 processes.json
│   ├── room-hub.ts           # ★ /room 协议实现（SDK ServerFrame 侧）
│   ├── room-repository.ts    # lowdb rooms.json（RoomRecord）
│   ├── room-logs.ts          # 房间结构化日志合并（marker 解析）
│   ├── trace-store.ts        # ★ 内存 trace LRU（64MiB/256KiB/TTL）
│   ├── system-processes.ts   # OS 级进程列表（System Tab 数据源）
│   ├── connection-config.ts  # 注入 PROCM_WS_URL/PROCM_HTTP_TOKEN 给被管进程
│   ├── events.ts             # 进程内事件总线（burst 合并）
│   ├── websocket-server.ts   # /ws dashboard 推送 + /room 挂载（upgrade 分发）
│   ├── http-server.ts        # REST + dashboard + /mcp 委托 + WS 挂载（127.0.0.1）
│   ├── mcp-http.ts           # /mcp stateless，注册 7 组 13 工具（无 process-input）
│   ├── dashboard-html.ts     # 托管 dashboard/dist 静态包
│   ├── project-scanner.ts    # 项目清单扫描 → favorites 候选
│   ├── server-log.ts         # serverId(nanoid) + 日志包装
│   ├── server-dir.ts         # <serverId> 子目录
│   ├── procm-mcp-dir.ts      # 数据目录根（--data-path > PROCM_MCP_DIR > tmpdir）
│   ├── logger.ts             # 写 debug.log（大小上限截断；settings.json 持久化设置）
│   ├── tool-helpers.ts       # textResult / notFoundResult
│   ├── error.ts              # toErrorMessage
│   ├── types.ts              # ProcessStatus / ProcessMetadata
│   ├── process-log-files.ts  # 日志文件层：路径解析/历史清单/删文件/清空历史（clearProcessLogs）
│   ├── native-directory.ts   # 原生目录选择器 pickDirectory（osascript / native-file-dialog）
│   ├── sleep.ts
│   └── tools/
│       ├── process.ts        # start-process / batch-process / process(get/delete/restart/list)
│       ├── process-logs.ts   # process-logs(tail/grep)
│       ├── process-log-files.ts  # process-log-files(路径) / log-files(历史清单)
│       ├── process-input.ts  # process-input(stdin/signal，stdio 限定)
│       ├── procm-commands.ts # procm-command(list/start)
│       ├── room.ts           # room(list/get/update) / room-logs(含 startTime/endTime)
│       ├── trace.ts          # trace-get
│       └── api-operations.ts # clear-process-logs / import-process-batch / select-directory（stdio 与 /mcp 均注册）
├── packages/procm-sdk/       # @hunmer/procm-mcp-sdk，见 packages/procm-sdk/CLAUDE.md
├── dashboard/                # 独立 React+Vite 工程，见 dashboard/CLAUDE.md
├── tests/                    # 13 套（run-all）+ log-clear-notification + ws-livecheck + _smoke-* + _helpers + fixtures
├── demo/                     # node-server / electron-client（SDK 接入示例）+ custom-execution-test
├── examples/                 # automation-testing 示例（single/multi-process，npm run example:automation）
├── documents/                # 研究文档（docs/research/*.mdx + sidebars.ts）
├── handoff/                  # 会话交接文档（log-clear-notification.md 等）
├── scripts/                  # link-global / link-sdk / publish-sdk / build-sdk-browser / demo 脚本
├── build/                    # tsc 产物，入口 build/index.js（勿手改；删源后需 clean 重建防孤儿）
├── procm-commands.json       # 本仓自用命令定义（全局 procm-mcp 按名启动，见 debug.md）
├── package.json              # scripts/files：发布 ["build","dashboard/dist"]；workspaces packages/*
├── tsconfig.json             # ESM/Node16，import 需 .js 后缀
└── .mcp.json / server.json   # MCP 配置/元数据
```

**关键定位**

| 要找 | 去哪 |
|---|---|
| 进程生命周期/spawn/persist | `src/process-manager.ts` |
| Windows 裸命令 spawn 兼容 | `process-manager.ts` `resolveSpawnTarget` |
| 日志捕获/tail/grep | `src/process-stdout-client.ts` |
| REST 路由 | `src/http-server.ts` |
| MCP 工具注册（stdio / HTTP） | `src/index.ts` / `src/mcp-http.ts` |
| `/ws` 推送 | `src/websocket-server.ts` + `src/events.ts` |
| `/room` 房间协议 | `src/room-hub.ts`（客户端侧在 `packages/procm-sdk/src/client.ts`） |
| 房间日志合并/过滤 | `src/room-logs.ts` |
| trace 存储/错误码 | `src/trace-store.ts` |
| 系统进程列表/kill | `src/system-processes.ts` |
| 命令重建（粘贴运行） | `http-server.ts` `buildCommand` |
| 允许发送的信号枚举 | `process-manager.ts` `ALLOWED_INPUT_SIGNALS` |
| 被管进程的环境注入 | `connection-config.ts` `getConnectionEnv` |
| 清空进程日志历史 | `process-log-files.ts` `clearProcessLogs`（REST `DELETE /api/processes/:id/logs`、工具 `clear-process-logs`） |
| 批量导入进程配置 | `http-server.ts`（`POST /api/processes/import-batch`）、工具 `import-process-batch`、SDK `rest.ts` `importProcessBatch` |
| 原生目录选择器 | `native-directory.ts` `pickDirectory` |
| 房间日志时间窗口过滤 | `room-logs.ts`（`startTime`/`endTime`，Unix 毫秒） |
| debug.log 大小上限/清理 | `logger.ts`（settings.json > `PROCM_DEBUG_LOG_MAX_BYTES` > 20MB）+ REST `/api/server-log*` 三件套 |
| 清空日志的 WS 通知 | `events.ts` `LOG_CLEAR` / `emitLogClear` → `websocket-server.ts` 广播 `logCleared` |
| 进程字段编辑/收藏开关 | `process-manager.ts` `updateProcessFields` / `setProcessFavorite`（REST `PATCH /api/processes/:id`） |
