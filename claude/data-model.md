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
  process: ChildProcess;          // 内部，不对外暴露
  stdoutClient: ProcessStdoutClient;  // 内部
  stderrClient: ProcessStdoutClient;  // 内部
};
```

进程列表 `processes: ProcessMetadata[]` 是 `process-manager.ts` 的模块级单例，被 MCP 工具与 HTTP dashboard 共享。

### `ProcessView`（对外 REST / dashboard）

`toPublicView(p)` 剥离内部字段：`{id,name,script,args,cwd,status,pid,exitCode,error}`。dashboard 的 `dashboard/src/lib/types.ts` 镜像此形状。

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

`spawn` → `running`；`error` 事件 → `error`；`exit` 事件 → `exited`（带 `exitCode`）。状态变更通过闭包 `applyProcessState()` 回写到 `ProcessMetadata`。

## 文件持久化

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

### 日志（原始文本）

`<serverDir>/processes/<processId>-<stdout|stderr>.log`：`fs.appendFile` 追加原始 chunk 文本（无时间戳前缀）。仅供人工查看。

### 写入串行化

`createUpdateQueue()` 把每次写入包成 `processing = processing.then(...)`，保证同一进程的日志写顺序；`top`/`search` 入口 `await updateQueue.processing` 确保读到已排空的最新状态。

### 白名单

`<tmpdir>/procm-mcp/allowed-process-creations.json`（注意：在 `serverId` 目录的**上一级**，跨 server 共享）。结构：`ProcessCreation[]`。不存在时视为 `[]`。每次增删都 `read`+`write` 全文件。

### 服务日志

`<serverDir>/debug.log`：`logger.ts` 用 `appendFileSync` 追加 `[<ISO>] <message>` 行。

## 进程间一致性

因为状态全在内存单例 + 本地文件，**同一台机器上多个 procm-mcp 进程互不可见**彼此的进程列表（各自有独立 `serverId` 与 `processes[]`）。CLI 客户端只能连到指定端口的**那一个**后端。
