# 数据模型

procm-mcp 没有传统数据库；状态分两类：**进程内内存状态**（模块级单例）与**文件持久化**（lowdb JSON / 文本 / 白名单 JSON）。

## 内存模型

### `ProcessMetadata`（`src/types.ts`）

```ts
type ProcessStatus = "spawning" | "running" | "exited" | "error";

type ProcessMetadata = {
  id: string;            // nanoid(8)
  pid: number | undefined;
  name: string;          // name || "<script> <args...>"
  script: string;
  args: string[];
  cwd: string;
  envs: Record<string, string>;
  status: ProcessStatus;
  error: string | null;
  exitCode: number | null;
  desc: string | null;             // 可选人类可读描述
  process: ChildProcess;          // 内部，不对外暴露
  stdoutClient: ProcessStdoutClient;  // 内部
  stderrClient: ProcessStdoutClient;  // 内部
};
```

进程列表 `processes: ProcessMetadata[]` 是 `process-manager.ts` 的模块级单例，被 MCP 工具与 HTTP dashboard 共享。

### `ProcessRecord`（持久化历史，`processes-repository.ts`）

内存 `ProcessMetadata` 的耐久化快照，剥离 `ChildProcess`/clients，加生命周期时间戳与日志路径：

```ts
type ProcessRecord = {
  // id, name, script, args, cwd, status, pid, exitCode, error, desc —— 同上
  startedAt: number;        // 首次启动 epoch ms（upsert 时保留，重启复用 id 不重置）
  stoppedAt: number | null; // 移出内存列表时置；仍在内存则为 null
  stdoutLogPath?: string | null;  // .log 绝对路径（停止后日志仍可读/下载）
  stderrLogPath?: string | null;
};
```

- 存于 `<tmpdir>/procm-mcp/processes.json`（**全局**，不随 serverId 变，跨重启存活）。
- `toRecord(meta, stoppedAt)` 做转换；`persist(meta)` fire-and-forget upsert（错误仅记日志不抛）。
- `listProcessRecords()` 返回「内存活进程 + 持久化历史」合并视图，活进程优先，按 startedAt 倒序。
- `removeMany(ids)` 单次读写，避免 lowdb 并发复活行。
- `reconcileStaleProcesses()`：启动时把上一轮残留的 `running` 记录回收（孤儿 PID 杀掉），标记 exited。

### `ProcessView`（对外 REST / dashboard）

`toPublicView(p)` 剥离内部字段：`{id,name,script,args,cwd,status,pid,exitCode,error,desc}`（单进程，无时间戳）。`toPublicRecord` 额外加 `startedAt`/`stoppedAt`。dashboard 的 `dashboard/src/lib/types.ts` 镜像后者形状（`startedAt?`/`stoppedAt?` 允许缺失）。

### allow-x 白名单条目

```ts
type ProcessCreation = { script: string; args: string[]; cwd: string };
```

匹配规则（`checkProcessCreationAllowed`）：`script` 全等 + `args` 逐位全等 + `cwd` 全等，**三者皆同**才放行。

### allow-all 开关

模块级 `let allowAll = false`（`process-manager.ts`），启动时由 `setAllowAll` 设置。为 true 时 `start-process`/`procm-command`（action `start`）跳过白名单查询。

### `ProcessStdoutClient`

```ts
type ProcessStdoutClient = {
  top: (count: number) => Promise<ProcessStdoutChunk[]>;
  search: (pattern: RegExp, count?: number) => Promise<ProcessStdoutChunk[]>;
  close: () => Promise<void>;
};
type ProcessStdoutChunk = { timestamp: Date; message: string };
```

`top`/`search` 返回按时间**倒序**的 chunk。

## 状态机（进程）

```
            spawn 成功
spawning ──────────────► running
    │                        │
    │ spawn error            │ exit(code)
    ▼                        ▼
  error ◄──────────────── exited
```

`spawn` → `running`；`error` 事件 → `error`；`exit` 事件 → `exited`（带 `exitCode`）。状态变更通过闭包 `applyProcessState()` 回写到 `ProcessMetadata`，并 `dashboardEvents.emitProcessChange()` 通知 WS 订阅者，同时 fire-and-forget `persist()` 落盘历史记录。

## 文件持久化

### 进程历史（lowdb JSON，**全局**）

`<tmpdir>/procm-mcp/processes.json`（注意：在 serverId 目录的**上一级**，跨重启共享），结构 `{ processes: ProcessRecord[] }`。`processes-repository.ts` 提供 `upsert/getAll/getById/remove/removeMany`。`ensureRepository()` 懒初始化（首次用到时建）。活进程每次状态变更 fire-and-forget upsert；停止时 `markStopped()` 置 `stoppedAt`。详见上面的 `ProcessRecord`。

### 日志（lowdb JSON）

`<serverDir>/processes/<processId>-<stdout|stderr>.json`，结构：

```ts
type LogsDb = { logs: { timestamp: number; message: string }[] };
```

`logs-repository.ts`：
- `insert`：`db.read()` → `push` → `db.write()`（每次写都落盘）。
- `top(count)`：读全部 → 按 `timestamp` 倒序 → slice。
- `search(pattern, count=50)`：读全部 → `pattern.test(message)` 过滤 → 倒序 → slice。
- `close`：`db.write()`。

> lowdb 每次操作都 `read`+`write` 全文件；日志量大时这是潜在性能/文件膨胀点（见 FAQ）。

### 日志（行分隔文本）

`<serverDir>/processes/<processId>-<stdout|stderr>.log`：`fs.appendFile` 追加带尾换行的文本（行分隔）。用途：停止/过期进程的日志读取（`readRecordLogText` 优先读同目录 `.json` lowdb 存储，缺失时回退读此 `.log`）、合并下载。**日志路径（绝对）也持久化进 `ProcessRecord`**，所以进程停止/重启后日志仍可读/下载。

### 写入串行化与实时推送

每条日志 chunk 经三路分发：
1. **立即** `dashboardEvents.emitLog()` 推 WS（不等磁盘，UI 不被 lowdb 拖慢）；
2. lowdb JSON `insert`；
3. `.log` 文本追加。

`createUpdateQueue()` 把 2+3 包成 `processing = processing.then(...)` 串行化；`top`/`search` 入口 `await updateQueue.processing` 确保读到已排空的最新状态。

### 白名单

`<tmpdir>/procm-mcp/allowed-process-creations.json`（注意：在 serverId 目录的**上一级**，跨 server 共享）。结构：`ProcessCreation[]`。不存在时视为 `[]`。每次增删都 `read`+`write` 全文件。

### 服务日志

`<serverDir>/debug.log`：`logger.ts` 用 `appendFileSync` 追加 `[<ISO>] <message>` 行。

## WebSocket 消息形状

`/ws` 推送两类 JSON（见 `websocket-server.ts` + `dashboard/src/lib/types.ts`）：

```ts
// 连接即发 snapshot:true，之后每次进程状态变更发
{ type: "processes", serverId, pid, startedAt, data: ProcessRecord[], snapshot?: true }
// 每条新日志
{ type: "log", processId, stream: "stdout"|"stderr", timestamp, message }
```

## 进程间一致性

因为状态全在内存单例 + 本地文件，**同一台机器上多个 procm-mcp 进程互不可见**彼此的**活进程**列表（各自有独立 `serverId` 与 `processes[]`）。但 `processes.json` 与 `allowed-process-creations.json` 在 `<tmpdir>/procm-mcp/`（全局），所以**历史记录和白名单跨 server 共享**（注意并发写无锁，见 testing-and-quality）。CLI 客户端只能连到指定端口的**那一个**后端。
