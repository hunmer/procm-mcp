## 总体思路

四个需求中，**#2 拆分 index.ts 是其它三个的前置**：grep、procm-commands、HTTP dashboard 都需要访问当前埋在 `index.ts` 里的 `processes` 状态和 `startProcess/killProcess` 等函数。所以先抽取共享的「进程管理器」单例，MCP 工具与 HTTP 服务都复用它，避免逻辑重复。

最终目录结构：
```
src/
  index.ts                 # 瘦入口：建 server、注册工具、启动 transport/http、信号处理 (~70 行)
  types.ts                 # NEW: ProcessMetadata / ProcessStatus
  server-log.ts            # NEW: serverId / logServerId / serverLog / logTool*
  process-manager.ts       # NEW: 进程状态 + start/kill/restart/list/get/cleanup/validate
  tool-helpers.ts          # NEW: textResult() / notFoundResult() 消除重复的 content 对象
  logger.ts procm-mcp-dir.ts server-dir.ts error.ts sleep.ts   # 不变
  allowed-process-creations.ts  # 不变
  process-stdout-client.ts # 改: 增加 search()
  logs-repository.ts       # 改: 增加 search()
  tools/
    server-info.ts         # get-server-id
    allowed-process.ts     # allow/list/delete-allowed-process
    process.ts             # start/delete/restart/get-info/list-processes
    process-logs.ts        # get-process-stdout / -stderr
    grep-logs.ts           # NEW: grep-process-logs
    procm-commands.ts      # NEW: get-procm-commands + start-procm-command
  http-server.ts           # NEW: dashboard HTTP 服务
  dashboard-html.ts        # NEW: 内嵌的单页 HTML（vanilla JS/CSS，无外部依赖）
```

---

## 步骤

### 1) 抽取共享模块（增量，不改行为）
- **`types.ts`**：`ProcessStatus`、`ProcessMetadata`（从 index.ts 搬出）。
- **`server-log.ts`**：`serverId = nanoid(6)`、`logServerId`、`serverLog`、`logToolStart/End/Error`（从 index.ts 搬出）。
- **`process-manager.ts`**：模块级 `processes` 数组（沿用现有单例模式）+ 导出 `listProcesses / getProcess / findProcessIndex / startProcess / killProcess / removeProcess(kill+splice) / restartProcess / cleanup / validateScript / createCommand`。
  - `validateScript` 解耦 MCP：返回 `string | null`（错误文案），由工具层包成 `CallToolResult`。
  - `startProcess` 内部仍用 `logServerId`（从 server-log 导入）。

### 2) 拆分 index.ts → tools/* （保真搬运）
- `tool-helpers.ts`：`textResult(text)`、`notFoundResult(id)`，替换掉散落各处的 `{content:[{type:"text",text}]}` 字面量，**不改控制流/日志语义**（try/catch + logToolStart/End/Error 原样保留）。
- 每个工具文件导出 `registerXxxTools(server: McpServer)`，内部调用 `server.tool(...)`，逻辑与现有完全一致。
- `index.ts` 瘦身为：建 `McpServer` → 调用各 `registerXxxTools` → 启动 transport/http → 信号处理 + cleanup。`exitProcess` 留在 index.ts。

### 3) #3 grep log 工具（单进程，已确认）
- `logs-repository.ts`：新增 `search(pattern: RegExp, count?: number)`，对 `db.data.logs` 做 `pattern.test(message)`，按时间倒序、截断 count（lowdb 本就全量读入内存，复用现有读取方式）。
- `process-stdout-client.ts`：`ProcessStdoutClient` 增加 `search(pattern, count)`，内部 `await updateQueue.processing` 后调用 repo.search。
- 新工具 `grep-process-logs`：
  - 入参：`id`(必填)、`pattern`(必填,字符串)、`stream?`("stdout"|"stderr"，缺省两者都查)、`ignoreCase?`(默认 false)、`count?`(默认 50)。
  - `new RegExp(pattern, ignoreCase?"i":"")`，`SyntaxError` → 返回友好的错误文案。
  - 结果按时间倒序合并、标注来源 stream，格式 `[ts] (stdout) message`。

### 4) #4 procm-commands.json（读取 + 按名启动，已确认）
文件 schema（在 README 说明）：
```json
{ "commands": { "dev": { "script":"npm", "args":["run","dev"], "cwd":".", "envs":{} } } }
```
- `get-procm-commands`：入参 `cwd?`(默认 `process.cwd()`)。读取该目录下 `procm-commands.json`，文件不存在 → 友好提示；存在 → 原样返回 JSON 文本 + 可用命令名清单。
- `start-procm-command`：入参 `name`(必填)、`cwd?`。读文件找 `commands[name]`；找不到 → 列出可用名；找到 → 映射为 `{script,args,cwd(相对项目根解析),envs,name}`，**走现有 `checkProcessCreationAllowed` (allow-x 校验)**，通过则调用 `process-manager.startProcess`。仍受 allow-x 模型约束。

### 5) #1 HTTP dashboard（完整管理，已确认）
- 启动方式：环境变量 `PROCM_HTTP_PORT` 设置时启动，仅绑定 `127.0.0.1`（localhost-only，默认关闭，不影响现有 stdio 用户）。可选 `PROCM_HTTP_TOKEN` 做 Bearer 校验。
- 用 Node 内置 `http` 模块，**不加新依赖**。
- 路由（复用 `process-manager`）：
  - `GET /` → 内嵌单页 dashboard（`dashboard-html.ts` 导出的 HTML 字符串）
  - `GET /api/processes` → 列表（id/name/命令/status/pid/exitCode）
  - `GET /api/processes/:id` → 详情
  - `GET /api/processes/:id/logs?stream=&count=` → 日志
  - `POST /api/processes` → 启动进程（body: script/args/cwd/name/envs）
  - `POST /api/processes/:id/stop` → 停止删除
  - `POST /api/processes/:id/restart` → 重启
- Dashboard 页面：自包含 HTML+vanilla JS+内联 CSS，无 CDN/构建步骤。进程表格定时刷新、状态着色、停止/重启按钮、查看日志抽屉、启动表单。
- **安全定位（README 注明）**：allow-x 门禁的是 **LLM/MCP** 路径；dashboard 是人类驱动的 localhost UI，人手动启动进程等价于在终端敲命令，故 dashboard 的 start 不走 allow-x。这条区别会写进 README。

### 6) 收尾
- README：新增工具说明、dashboard 用法与端点、procm-commands.json schema、grep 工具。
- `package.json` / `server.json` 版本号 0.0.43 → 0.0.44。
- 验证：`npm run build`（tsc 通过）；手动启动设 `PROCM_HTTP_PORT` 打开 dashboard；通过 MCP inspector 调用新工具。仓库无自动化测试运行器（tests/ 仅为手动 fixture），不引入测试框架。

## 风险与取舍
- 拆分是纯搬运 + 薄封装，行为保持一致；`validateScript` 返回类型从 `CallToolResult` 改为 `string|null` 是唯一语义等价的接口调整。
- grep/procm-commands/HTTP 均为纯新增，不改动现有 8 个工具行为。
- HTTP 默认关闭，对现有用户零影响。