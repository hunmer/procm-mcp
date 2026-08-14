# 调试环境

## 管理关系

调试环境必须使用全局安装并已接入 Agent 的 `procm-mcp` 作为唯一进程管理器。当前项目的 `procm-mcp`、dashboard、demo Node server 和 demo Electron client 都由全局实例读取根目录的 `procm-commands.json` 后启动。

- 全局 `procm-mcp`：管理器，通常监听 `7331`，提供 Agent 使用的 MCP tools。
- 当前项目 `procm-mcp`：被管理服务，监听 `7332`，数据保存在 `.procm-mcp-data`。
- dashboard：监听 `5173`，代理到当前项目后端 `7332`。
- demo Node server：监听 `4444`，连接当前项目后端的 room WebSocket。
- demo Electron client：连接当前项目后端的 room WebSocket。

禁止直接执行 `node build/index.js --server`、`npm run dev` 或 demo 启动脚本来创建常驻调试服务。禁止通过当前项目 `7332` 的 MCP/HTTP 接口管理或重启当前项目自身。

## 启动环境

项目路径固定传给全局 `procm-command`：

```text
/Users/Zhuanz/Documents/procm-mcp
```

1. 使用全局 `procm-command` 执行 `action=list`，确认以下命令存在且未重复运行：
   - `procm-mcp`
   - `dashboard`
   - `demo-node-server`
   - `demo-electron-client`
2. 使用全局 `procm-command` 执行 `action=start, name=procm-mcp`。
3. 使用全局 `process` 查询返回的进程 ID，确认状态为 `running`；使用全局 `process-logs` 确认 `7332` 已就绪。
4. 再使用全局 `procm-command` 启动其余三个命令。
5. 使用全局 `process` 确认四个进程均为 `running`。

启动存在依赖顺序：必须先确认当前项目 `procm-mcp` 就绪，再启动 dashboard 和两个 demo。多个同名进程已运行时不要重复启动。

## 构建与重启

修改 `src/` 后，先执行 `npm run build`，成功后才重启当前项目后端。

当前项目 `procm-mcp` 的所有重启操作也必须发给全局 `procm-mcp`：

- 启动参数未变化：使用全局 `process` 执行 `action=restart, id=<当前项目进程 ID>`。
- `procm-commands.json` 中的 script、args、cwd 或 envs 已变化：使用全局 `process` 删除旧进程，再使用全局 `procm-command` 执行 `action=start, name=procm-mcp`。直接 restart 会沿用旧进程参数。

重启后使用全局 `process` 和 `process-logs` 验证：

```text
node build/index.js --server --port 7332 --data-path .procm-mcp-data
```

dashboard 和 demo 客户端应自动重连。若未恢复，再通过全局 `procm-mcp` 分别重启对应进程，不要改为手工启动。

## 停止与日志

- 停止服务：使用全局 `process` 的 `action=delete`。
- 查看日志：使用全局 `process-logs`，按进程 ID 读取 stdout 或 stderr。
- 查看状态：使用全局 `process` 的 `action=list` 或 `action=get`。
- MCP tools 不可用时：按 `.agents/skills/procm-mcp/SKILL.md` 连接全局后台进行 HTTP/CLI fallback；不要启动当前项目实例替代全局管理器。

## 快速验收

1. 全局进程列表中四个命令均为 `running`。
2. `http://127.0.0.1:7332` 可访问当前项目后端。
3. `http://localhost:5173` 可访问 dashboard。
4. `http://127.0.0.1:4444` 可访问 demo Node server。
5. `.procm-mcp-data/processes.json` 和 `.procm-mcp-data/rooms.json` 存在，且当前项目没有写入全局实例的数据目录。
