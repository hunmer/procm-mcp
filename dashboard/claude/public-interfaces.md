# dashboard 对外接口

dashboard 自身是后端 `GET /` 托管的静态页面，**不对外暴露接口**。它消费后端的同源 REST API（完整定义见根 [claude/public-interfaces.md](../claude/public-interfaces.md)）。此处只列 dashboard 实际用到的调用。

## dashboard 调用的 REST（`src/lib/api.ts`）

| 函数 | 请求 | 用途 |
|---|---|---|
| `listProcesses()` | `GET /api/processes` | 进程列表（App 顶层 `refresh`，3s 轮询可选） |
| `getProcess(id)` | `GET /api/processes/:id` | 单进程详情（已定义，当前组件未直接使用） |
| `getLogs(id, stream, count=200)` | `GET /api/processes/:id/logs?stream=&count=` | LogPanel 取日志 |
| `startProcess(body)` | `POST /api/processes` | NewProcessDialog 启动（**绕过 allow-x**） |
| `stopProcess(id)` | `POST /api/processes/:id/stop` | ProcessList 停止 |
| `restartProcess(id)` | `POST /api/processes/:id/restart` | ProcessList 重启 |

## 类型契约（`src/lib/types.ts`，镜像后端 `toPublicView`）

```ts
type ProcessStatus = "spawning" | "running" | "exited" | "error";
interface ProcessView { id; name; script; args; cwd; status; pid; exitCode; error }
interface ProcessListResponse { serverId; pid; processes: ProcessView[] }
interface LogsResponse { stream: "stdout"|"stderr"; text: string }
interface StartProcessBody { name?; script; args?; cwd; envs? }
```

> 后端 `ProcessView` 字段变动时，必须同步本文件。

## 鉴权

若后端设了 `PROCM_HTTP_TOKEN`，浏览器请求需带 `Authorization: Bearer <token>`。当前 `lib/api.ts` **未自动注入 token**——dashboard 在受 token 保护的后端上会收到 401。这是已知缺口（受 token 保护场景下 dashboard 需额外处理）。
