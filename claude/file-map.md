# 文件地图

## 仓库根

```
procm-mcp/
├── src/                       # 后端 TypeScript 源（编译 → build/）
│   ├── index.ts               # 主入口：CLI 解析 + 三模式分流 + 信号处理
│   ├── cli-client.ts          # CLI 客户端模式（ps/info/logs/grep/start/restart/stop/ping）
│   ├── http-server.ts         # HTTP 服务器：REST + 静态资源 + /mcp 路由 + token 鉴权
│   ├── mcp-http.ts            # /mcp Streamable HTTP transport（stateless）
│   ├── dashboard-html.ts      # dashboard dist 解析 + /assets 服务 + 路径穿越防护
│   ├── process-manager.ts     # ★ 进程生命周期核心（模块级单例 processes[] + 持久化）
│   ├── allowed-process-creations.ts  # allow-x 白名单 JSON CRUD
│   ├── processes-repository.ts      # 进程历史持久化（lowdb processes.json）
│   ├── process-stdout-client.ts      # 日志消费 + 实时emit + 双写 + updateQueue
│   ├── logs-repository.ts     # lowdb 日志存储（insert/top/search/close）
│   ├── events.ts              # 进程内事件总线（emitProcessChange/emitLog）
│   ├── websocket-server.ts    # /ws 实时推送（挂到 http.Server upgrade）
│   ├── project-scanner.ts     # 扫描 package.json/pyproject.toml/Cargo.toml → favorites 候选
│   ├── server-log.ts          # serverId/logServerId + serverLog/logTool*
│   ├── logger.ts              # debug.log 追加
│   ├── procm-mcp-dir.ts       # <tmpdir>/procm-mcp
│   ├── server-dir.ts          # <procmMcpDir>/<serverId>
│   ├── types.ts               # ProcessStatus / ProcessMetadata
│   ├── error.ts               # isError / toErrorMessage
│   ├── sleep.ts               # sleep(ms)
│   ├── tool-helpers.ts        # textResult / notFoundResult
│   └── tools/
│       ├── allowed-process.ts # allowed-process (action: allow/delete/list)
│       ├── process.ts         # start-process / process (action: get/delete/restart/list)
│       ├── process-logs.ts    # process-logs (tail 或 grep)
│       └── procm-commands.ts  # procm-command (action: list/start)
├── tests/
│   ├── _helpers.mjs           # 断言 + startBackend/http/mcpCalls/mcpHttp
│   ├── run-all.mjs            # 串行跑 6 套
│   ├── lifecycle.mjs          # 生命周期
│   ├── logs-grep.mjs          # 日志 grep
│   ├── http-api.mjs           # REST
│   ├── mcp-http.mjs           # /mcp
│   ├── allow-x.mjs            # allow-x
│   ├── cli-roundtrip.mjs      # CLI 客户端
│   ├── example-process.js     # 长寿无操作子进程替身
│   ├── docker-compose.yml     # 手工验证用
│   └── nginx-test.conf        # 手工验证用
├── scripts/
│   ├── link-global.mjs        # build + npm link + 修 PATH
│   └── demo/                  # 演示进程（dashboard presets 用）
│       ├── counter.mjs        # 每秒自增计数（stdout）
│       ├── slow-log.mjs       # stdout/stderr 交替
│       └── http-server.mjs    # 微型 HTTP 服务器（记请求日志）
├── dashboard/                 # ★ 独立 React/Vite 工程（见 dashboard/CLAUDE.md）
├── .github/workflows/publish.yml   # npm + MCP Registry 发布
├── package.json               # bin/scripts/deps
├── tsconfig.json              # ES2022/Node16/strict
├── server.json                # MCP Registry 元数据
├── .mcp.json                  # 仓库示例客户端配置
├── .gitignore
├── skills-lock.json           # agent skills 锁（非运行时）
└── README.md                  # 用户文档
```

## 被忽略的目录（生成物 / 依赖）

- `node_modules/`、`dashboard/node_modules/` — 依赖。
- `build/` — `tsc` 产物。
- `dashboard/dist/` — Vite 产物。
- `.git/`、`.zcode/`、`.codex/`、`.agents/`、`.claude/` — 工具/agent 配置（非项目源码）。

## 关键文件定位速查

| 想找... | 去哪 |
|---|---|
| 进程是怎么 spawn/kill 的 | `src/process-manager.ts` |
| 某个 MCP 工具的实现 | `src/tools/<area>.ts` |
| 某条 REST 路由 | `src/http-server.ts` 的 `createRequestHandler` |
| allow-x 校验逻辑 | `src/allowed-process-creations.ts` `checkProcessCreationAllowed` |
| 日志怎么存/查 | `src/process-stdout-client.ts` + `src/logs-repository.ts` |
| 进程历史持久化/跨重启 | `src/processes-repository.ts` + `process-manager.ts` 的 `persist`/`listProcessRecords` |
| WebSocket 实时推送 | `src/websocket-server.ts` + `src/events.ts` |
| dashboard 实时日志的数据流 | `process-stdout-client` → `events.emitLog` → `websocket-server` → `dashboard/src/lib/ws.ts` |
| favorites 扫描 | `src/project-scanner.ts`（后端）+ `dashboard/src/lib/favorites.ts`（前端存储） |
| 启动模式判定 | `src/index.ts` 的 `parseArgs` 与 try 块 |
| CLI 子命令实现 | `src/cli-client.ts` |
| 运行时数据落盘位置 | `src/procm-mcp-dir.ts` + `src/server-dir.ts` |
