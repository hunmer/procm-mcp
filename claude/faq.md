# 常见问题与定位

**Q：为什么 `start-process` 启动的命令没经过白名单/审批？**
进程启动本就**没有**白名单或 allow-x 门控（该功能已移除）。`start-process` / `procm-command(start)` / dashboard `POST /api/processes` / CLI `start` 都直接执行命令。把它当作任意 shell 命令工具，靠 MCP 客户端的人工确认把关。

**Q：改了 TS 没生效？**
必须 `npm run build`（= `build:dashboard && tsc`），运行入口是 `build/index.js`。

**Q：从源里删了 `.ts`，为什么 `build/` 里还有对应 `.js`？**
`tsc` 不删产物。孤儿 `.js` 不会被 import（运行时无害），但要让 `build/` 干净需 `rm -rf build && npm run build`。（例：本轮移除 allow-x 后删了 `build/tools/allowed-process.js`、`build/allowed-process-creations.js`、`build/logs-repository.js`。）

**Q：stdio 和 `/mcp` 工具数不一样？**
对：stdio 9 个，`/mcp` 8 个（缺 `process-input`）。`process-input` 仅在 `index.ts` 注册，未在 `mcp-http.ts` 的 `registerAllTools` 注册。要写 stdin/发信号经 HTTP 请用 REST `POST /api/processes/:id/input` 或 dashboard。

**Q：`/ws` 和 `/room` 有什么区别？**
`/ws` 是 dashboard 专用的状态/日志推送（进程列表 + 日志行）；`/room` 是 SDK `ProcmClient` 的房间消息协议（hello/subscribe/publish/member/trace:put）。被管进程拿到的 `PROCM_WS_URL` 指 `/room`。两端口共用同一 token 鉴权。

**Q：trace 重启后还在吗？**
不在。trace 存后端进程内存 LRU（64 MiB），重启即清、LRU 可能提前逐出、跨实例不共享——设计就是 ephemeral 的当次诊断。

**Q：Windows 上 `start-process` 一个裸命令（如 `npm`）失败？**
`process-manager.ts` 的 `resolveSpawnTarget` 已按 `PATHEXT` 解析 `.cmd`/`.bat` shim 并转 shell 启动；若仍失败检查 PATH 是否含该命令、`PATHEXT` 是否被改。

**Q：重启后历史还在吗？**
在。`processes.json`（进程历史）在 `<tmpdir>/procm-mcp/` 根级，全局跨重启/跨 server 共享。但**活进程列表**不在——它是每个后端进程的内存单例，`serverId` 各自独立，重启后旧进程不再「活」。日志 `.log` 按 `serverId` 隔离，重启后新实例写新目录。

**Q：多个 procm-mcp 后端能互相看到对方的活进程吗？**
不能。活进程是内存单例，`serverId` 独立。但 `processes.json`（历史）全局共享，所以历史跨 server 可见（注意并发写无锁）。

**Q：`/mcp` 与 dashboard 状态一致吗？**
一致。状态全在模块级单例 + 本地文件，`/mcp` 是 stateless 但状态不依赖会话，故与 stdio/REST/dashboard 一致。

**Q：要 token 鉴权怎么配？**
设 `PROCM_HTTP_TOKEN`：HTTP/`/mcp`/dashboard 带 `Authorization: Bearer <token>`；WS 用 `?token=` 或 `bearer.<token>` 子协议；CLI 用 `--token` 或 `PROCM_HTTP_TOKEN`。
