# procm SDK Hook + Redis Trace 详细实施计划

## 0. 文档信息

- 状态：待实施
- 编写日期：2026-08-15
- 目标仓库：`/Users/Zhuanz/Documents/procm-mcp`
- 需求来源：SDK hook 函数/变量，采集调用链与函数位置；详细数据写入 Redis；logger 仅输出关联 ID；MCP tool 按 ID 读取详情
- 基线版本：`procm-mcp@0.0.44`、`@procm-mcp/sdk@0.1.0`
- 实施原则：最小改动、保持兼容、业务控制台零额外追踪噪音、错误必须可观察

## 1. 目标与非目标

### 1.1 必须完成

1. SDK 可以包装同步函数和返回 Promise 的异步函数。
2. 每次函数调用生成唯一 `traceId`，采集调用链、运行时文件、行号、列号、耗时和结果状态。
3. hook 保留参考实现的 `before`、`after`、修改参数、跳过原函数、修改返回值能力。
4. SDK 可以把任意符合 JSON 约束的诊断数据提交给 procm-mcp，由 procm-mcp 写入 Redis，并异步返回 ID。
5. hook 产生的追踪详情自动通过上述保存能力写入 Redis，不把详情打印到业务控制台。
6. SDK logger 的结构化 JSON 增加可选 `traceId`，现有 logger 调用完全兼容。
7. `room-logs` 解析结果保留 `traceId`。
8. 新增 MCP tool，通过 ID 从 Redis 读取完整追踪详情。
9. MCP stdio 和 MCP-over-HTTP 两个入口都必须注册新 tool。
10. Redis 未配置或临时不可用时，procm-mcp 仍能启动和管理进程；只有追踪保存/读取功能返回明确错误。
11. 提供自动化测试文件，覆盖正常、边界、故障和兼容场景。

### 1.2 首版明确不做

1. 不尝试拦截普通局部变量、闭包变量或 ESM 只读导入绑定。JavaScript 没有可靠的外部拦截机制。
2. “变量 hook”首版限定为对象自有且 `configurable: true` 的属性 get/set 观察。
3. 不把运行时 JavaScript 位置映射回 TypeScript 源码；首版返回 V8/callsites 提供的运行时位置。
4. 不把 Redis 地址、密码或 TLS 配置传给 SDK/被管理业务进程。
5. 不提供 Redis 数据浏览、列表、模糊查询和删除 MCP tool，只支持按不可预测 ID 精确读取。
6. 不自动记录参数和返回值；必须由调用方显式开启。
7. 不引入全局 `AsyncLocalStorage` 自动注入 logger，避免扩大 SDK 的 Node 专用耦合和隐式行为。
8. 不改 dashboard，不在本次增加追踪详情 UI。

## 2. 已锁定的设计决策

### 2.1 Redis 所有权

- SDK 不直接连接 Redis。
- SDK 通过现有 `/room` WebSocket 协议提交数据。
- procm-mcp 服务端持有 Redis 连接并负责校验、序列化、TTL 和错误归一化。
- Redis 使用官方 `redis` 包；计划实施时锁定当前确认版本 `6.2.1`。
- Redis 为可选能力，通过 `PROCM_REDIS_URL` 启用。
- 默认 TTL：`86400` 秒（24 小时）。
- 可配置 TTL：`PROCM_TRACE_TTL_SECONDS`，允许范围 `1..604800` 秒（1 秒到 7 天）。生产环境建议不低于 60 秒，自动化过期测试使用 1 秒。
- Redis key：`procm:trace:v1:<traceId>`。
- 单条序列化后 UTF-8 最大 `262144` 字节（256 KiB）。
- 单条调用链最多保留 100 帧，超出部分从最外层截断。

### 2.2 ID 与写入语义

- ID 使用 `crypto.randomUUID()`，字段统一命名为 `traceId`。
- hook 在调用原函数前生成 ID，因此 `before` 可以立即使用 `traceId` 写关联日志。
- 追踪记录在函数成功、抛错或 Promise settle 后保存，以便包含耗时和最终状态。
- `saveTrace` 是确认写入接口：Promise 只有收到服务端 Redis 写入确认后才 resolve。
- hook 不等待 Redis 写入再返回同步结果，禁止把同步函数隐式变成 Promise。
- hook 的 Redis 写入失败通过 `onStoreError` 回调报告；默认不调用任何 `console.*`。
- ID 冲突时服务端使用 Redis `SET ... NX`。未显式指定 ID 时 SDK 最多重新生成并重试 2 次；调用方显式指定 ID 时不得换 ID，直接返回冲突错误。

### 2.3 兼容与版本

- 保持 `PROCM_PROTOCOL_VERSION = 1`，新增帧类型而不是修改现有帧字段语义。
- 旧 SDK 与新服务端继续工作。
- 新 SDK 调用旧服务端保存追踪时必须在超时或 `invalid_frame` 后明确 reject，不得永久等待。
- `StructuredLog.traceId`、`RoomLogEntry.traceId` 都是可选字段。
- logger 原有两参数调用、现有编码标记和可读文本格式保持不变。

## 3. 对外 API 契约

以下签名是实施目标。允许为 TypeScript 可表达性调整泛型细节，但不得改变行为语义。

### 3.1 保存任意诊断数据

文件：`packages/procm-sdk/src/trace.ts`

```ts
export interface SaveTraceOptions {
  id?: string;
  ttlSeconds?: number;
  timeout?: number;
  signal?: AbortSignal;
}

export interface TraceEnvelope<T extends JsonValue = JsonValue> {
  version: 1;
  traceId: string;
  createdAt: number;
  roomId: string;
  memberId: string;
  processId?: string;
  data: T;
}

export function saveTrace<T extends JsonValue>(
  client: ProcmClient,
  data: T,
  options?: SaveTraceOptions,
): Promise<string>;
```

行为约束：

1. `client.connectionState !== "open"` 时立即 reject。
2. `ttlSeconds` 不在允许范围时在 SDK 侧 reject，不发送网络请求。
3. `data` 不能被 JSON 安全序列化时 reject。
4. 超过 256 KiB 时 SDK 侧先 reject，服务端仍必须二次校验。
5. resolve 值必须等于 Redis 中记录的 `traceId`。
6. Abort/timeout 后清理请求等待器，不得泄漏 listener 或 timer。

### 3.2 函数 hook

文件：`packages/procm-sdk/src/hook.ts`

```ts
export interface TraceFrame {
  index: number;
  functionName: string;
  file: string;
  line: number | null;
  column: number | null;
  async: boolean;
}

export interface FunctionTrace {
  kind: "function";
  traceId: string;
  name: string;
  startedAt: number;
  durationMs: number;
  status: "returned" | "resolved" | "threw" | "rejected" | "skipped";
  callChain: TraceFrame[];
  args?: JsonValue;
  result?: JsonValue;
  error?: { name: string; message: string; stack?: string };
}

export interface CreateHookOptions {
  client?: ProcmClient;
  name?: string;
  captureArgs?: boolean;
  captureResult?: boolean;
  ttlSeconds?: number;
  filterFrame?: (frame: TraceFrame) => boolean;
  onTraceCreated?: (traceId: string) => void;
  onStored?: (traceId: string) => void;
  onStoreError?: (error: Error, traceId: string) => void;
}

export function createHook<TFunction extends (...args: any[]) => any>(
  fn: TFunction,
  options?: CreateHookOptions,
): HookedFunction<TFunction>;
```

`HookedFunction` 必须提供：

- `.before(handler)`：收到 `traceId`、当前参数、调用链、`setArgs()` 和 `skip()`。
- `.after(handler)`：收到 `traceId`、参数、结果或错误、调用链和 `setResult()`。
- `.original`：原始函数引用。
- 链式 `.before(...).after(...)`。

行为约束：

1. 保留调用时的 `this`。
2. 同步原函数仍同步返回，且 `result instanceof Promise` 不得因 hook 本身改变。
3. Promise 原函数保持 Promise，并在 resolve/reject 后执行 after 和保存。
4. 同步 throw 与 Promise reject 都必须执行 after，然后原样抛出同一个错误对象。
5. before/after 本身首版只允许同步 handler；返回 Promise 时抛出明确错误，避免同步函数类型漂移。
6. `captureArgs/captureResult` 默认 false。
7. JSON 序列化失败时记录占位信息，不得改变原函数执行结果。
8. `client` 未提供时仍可完成本地 hook，但不保存 Redis，也不输出控制台。

### 3.3 对象属性 hook

```ts
export interface PropertyHookOptions extends CreateHookOptions {
  captureGet?: boolean;
  captureSet?: boolean;
}

export function hookProperty<T extends object, K extends keyof T>(
  target: T,
  key: K,
  options?: PropertyHookOptions,
): () => void;
```

行为约束：

1. 只接受对象自有属性。
2. 属性不存在或 `configurable !== true` 时立即抛错。
3. 保留原 `enumerable`、getter、setter、writable 和 value 语义。
4. 默认同时追踪 get/set；可分别关闭。
5. 返回的恢复函数幂等，第一次恢复原 descriptor，后续调用无副作用。
6. hook 和恢复过程中不得改变属性当前值。

### 3.4 Logger 关联字段

文件：`packages/procm-sdk/src/logger.ts`、`packages/procm-sdk/src/protocol.ts`

```ts
export interface LogContext {
  traceId?: string;
}

logger.info(message, data?, context?);
logger.debug(message, data?, context?);
logger.warn(message, data?, context?);
logger.error(message, data?, context?);
logger.log(level, message, data?, context?);
```

结构化日志新增：

```ts
interface StructuredLog {
  // existing fields...
  traceId?: string;
}
```

控制台约束：每次 logger 调用仍只调用一次对应的 `console[level]`。`traceId` 只进入结构化帧，不新增调用链正文、Redis 状态或额外日志行。

推荐用法：

```ts
const hooked = createHook(fetchUser, {
  client,
  name: "fetchUser",
});

hooked.before(({ traceId, args }) => {
  logger.info("fetchUser called", { userId: args[0] }, { traceId });
});
```

### 3.5 MCP tool

文件：`src/tools/trace.ts`

- tool 名称：`trace-get`
- 输入：`{ id: string }`
- `id`：trim 后长度 `1..128`，只允许 `[A-Za-z0-9_-]`。
- 成功文本内容：格式化 JSON `{ "ok": true, "trace": <TraceEnvelope> }`。
- 失败文本内容：格式化 JSON `{ "ok": false, "error": { "code": string, "message": string } }`。

稳定错误码：

- `TRACE_NOT_FOUND`：ID 不存在或已过期。
- `TRACE_REDIS_NOT_CONFIGURED`：未配置 `PROCM_REDIS_URL`。
- `TRACE_REDIS_UNAVAILABLE`：连接或命令失败。
- `TRACE_INVALID_ID`：ID 格式非法。
- `TRACE_INVALID_PAYLOAD`：服务端收到非法或超限内容。
- `TRACE_STORE_CONFLICT`：ID 连续冲突。
- `TRACE_REQUEST_TIMEOUT`：SDK 等待确认超时。

## 4. Redis 数据模型与生命周期

### 4.1 存储 JSON

```json
{
  "version": 1,
  "traceId": "uuid",
  "createdAt": 1786723200000,
  "roomId": "room-a",
  "memberId": "process-id:client",
  "processId": "process-id",
  "data": {
    "kind": "function",
    "name": "fetchUser",
    "startedAt": 1786723200000,
    "durationMs": 12.5,
    "status": "resolved",
    "callChain": [
      {
        "index": 0,
        "functionName": "service",
        "file": "src/service.js",
        "line": 42,
        "column": 18,
        "async": true
      }
    ]
  }
}
```

### 4.2 Redis 客户端生命周期

1. 新增 `src/trace-store.ts`，内部维护单例客户端和并发安全的连接 Promise。
2. 第一次 `putTrace/getTrace` 时才连接，启动阶段不强制依赖 Redis。
3. Redis 客户端 `error` 事件必须被消费，避免 Node 未处理事件；只写现有 server log，不写 stdout。
4. 连续连接失败不得为每次调用重复注册 listener。
5. 进程清理阶段调用 `closeTraceStore()`；关闭函数幂等。
6. 测试只能删除本次生成的 key，禁止 `FLUSHDB/FLUSHALL`。

## 5. WebSocket 协议扩展

### 5.1 ClientFrame

```ts
{
  version: 1;
  type: "trace:put";
  requestId: string;
  traceId: string;
  ttlSeconds?: number;
  payload: JsonValue;
}
```

### 5.2 ServerFrame

```ts
{
  version: 1;
  type: "trace:stored";
  requestId: string;
  traceId: string;
}
```

现有 `error` 帧增加可选 `requestId`，用于把服务端错误关联到具体保存请求。

### 5.3 请求关联与清理

1. `ProcmClient` 增加 `pendingTraceRequests` Map。
2. `trace:stored` 根据 `requestId` resolve 对应 Promise。
3. 带 `requestId` 的 error reject 对应 Promise。
4. socket close、`client.close()`、timeout 和 abort 都必须 reject 并删除等待项。
5. 无匹配 requestId 的响应安全忽略，不影响 room 消息处理。
6. 并发请求响应可以乱序，必须逐一正确关联。

## 6. 文件级改动清单

### 6.1 新增文件

| 文件 | 职责 |
| --- | --- |
| `packages/procm-sdk/src/trace.ts` | `saveTrace`、请求等待、大小/TTL 校验、公开类型 |
| `packages/procm-sdk/src/hook.ts` | 函数 hook、属性 hook、调用链采集、trace 组装 |
| `src/trace-store.ts` | Redis 懒连接、SET NX EX、GET、错误归一化、关闭 |
| `src/tools/trace.ts` | `trace-get` MCP tool |
| `tests/fixtures/hook-target.mjs` | 提供稳定的同步/异步嵌套调用位置 |
| `tests/sdk-hook.mjs` | 无 Redis 的 hook 单元/行为测试 |
| `tests/trace-logger.mjs` | logger 编码、兼容、控制台噪音测试 |
| `tests/trace-redis.mjs` | 真实 Redis、WebSocket、MCP stdio/HTTP 端到端测试 |

### 6.2 修改文件

| 文件 | 改动 |
| --- | --- |
| `packages/procm-sdk/src/protocol.ts` | trace 帧、`traceId`、解析校验、错误关联 |
| `packages/procm-sdk/src/client.ts` | 处理 trace 响应与 pending 请求生命周期 |
| `packages/procm-sdk/src/logger.ts` | 可选 `LogContext` 和结构化 `traceId` |
| `packages/procm-sdk/src/index.ts` | 导出 trace/hook API |
| `packages/procm-sdk/package.json` | 增加 `callsites@4.2.0` 运行依赖 |
| `src/room-hub.ts` | 拦截 `trace:put`，校验并调用 trace store |
| `src/room-logs.ts` | 解析并返回 `traceId` |
| `src/index.ts` | stdio 注册 `trace-get`；退出时关闭 Redis |
| `src/mcp-http.ts` | HTTP MCP 注册 `trace-get` |
| `package.json` | 增加 `redis@6.2.1`、测试脚本 |
| `package-lock.json` | 锁定依赖树 |
| `tests/_helpers.mjs` | backend/MCP helper 支持额外 env，保持旧签名兼容 |
| `tests/run-all.mjs` | 加入不依赖 Redis 的 hook/logger 测试 |
| `tests/docker-compose.yml` | 新增隔离的 `redis-test` 服务 |
| `README.md` | 环境变量、SDK 用法、tool 用法、限制和故障语义 |

### 6.3 不应修改

- `dashboard/**`
- 现有进程、room、日志 tool 的名称和输入结构
- 已生成的 `packages/procm-sdk/dist/**`，只能由 build 命令生成
- 与本功能无关的格式和注释

## 7. 实施顺序与阶段出口

### 阶段 A：SDK 本地能力

1. 增加 hook 类型和实现。
2. 增加 logger `traceId` 类型、编码和解析。
3. 增加 `sdk-hook.mjs`、`trace-logger.mjs`。

阶段出口：SDK build 通过；AC-01 到 AC-08、AC-15 到 AC-17 全部通过。

### 阶段 B：Redis 存储

1. 增加 Redis 依赖和 `trace-store.ts`。
2. 完成 TTL、大小、NX、错误归一化和关闭逻辑。
3. 使用真实 Redis 验证存取、过期和不可用场景。

阶段出口：AC-09 到 AC-14 通过，不改 SDK 函数返回语义。

### 阶段 C：协议与 MCP

1. 扩展协议帧和 client pending 管理。
2. `room-hub` 接收保存请求。
3. 新增并双入口注册 `trace-get`。
4. 完成 `trace-redis.mjs`。

阶段出口：AC-18 到 AC-25 通过。

### 阶段 D：回归与文档

1. 更新 README、测试入口和 Compose。
2. 执行完整构建、默认测试、真实 Redis 测试。
3. 检查 git diff，仅包含计划内文件。

阶段出口：AC-26 到 AC-30 通过，满足 Definition of Done。

## 8. 测试文件详细设计

### 8.1 `tests/sdk-hook.mjs`

必须包含以下独立用例：

1. 同步函数返回值和返回类型不变。
2. 方法调用保留 `this`。
3. 多个 before 按注册顺序执行。
4. before `setArgs` 修改原函数入参。
5. before `skip` 不执行原函数并返回指定值。
6. 多个 after 按注册顺序执行并可连续修改结果。
7. 同步 throw 时 after 收到同一错误，调用方捕获同一对象。
8. Promise resolve 后 after 修改结果。
9. Promise reject 后 after 收到同一错误，调用方捕获同一对象。
10. 同步函数的 before/after 返回 Promise 时明确失败，不静默改变类型。
11. fixture 的调用链包含预期函数顺序、文件名、正整数行号/列号。
12. `captureArgs/captureResult` 默认不出现，开启后出现。
13. BigInt、循环引用等不可 JSON 化值不影响原函数结果。
14. client 未提供时 hook 不访问 console、不尝试网络。
15. 属性 get/set 均被追踪，原 descriptor 行为保持一致。
16. 属性恢复函数幂等。
17. 不存在、继承或不可配置属性按契约抛错。

### 8.2 `tests/trace-logger.mjs`

必须包含以下独立用例：

1. 四个级别的第三参数都能编码 `traceId`。
2. `logger.log()` 能编码 `traceId`。
3. 不传 context 时结构化输出与旧格式字段一致。
4. 旧格式结构化日志仍能 decode。
5. 非法 `traceId` 不应导致 logger 抛错；按类型约束传入字符串后原样编码。
6. 每次 logger 调用只触发一次对应 console 方法。
7. logger 不额外打印调用链、Redis URL、Redis 错误或第二行文本。
8. room log 解析结果包含 `traceId`，无 ID 的旧日志保持 `undefined`。

### 8.3 `tests/trace-redis.mjs`

前置条件：必须设置 `PROCM_REDIS_URL`；缺失时测试直接失败并提示启动命令，不允许 skip。

必须包含以下独立用例：

1. SDK 经 WebSocket 保存 JSON，返回 ID，Redis 中存在对应 key。
2. 保存的 envelope 包含正确 room/member/process 标识。
3. 同时发出 20 个保存请求，响应乱序时 ID 与数据仍一一对应。
4. 显式使用同一 ID 保存两次时第二次返回冲突，第一次的数据不得被覆盖。
5. 指定 TTL 后 key 自动过期。
6. 超过 256 KiB 的请求在 SDK 侧拒绝，Redis 不产生 key。
7. 绕过 SDK 发送超限帧时服务端仍拒绝，Redis 不产生 key。
8. 非法 TTL 在 SDK 和服务端两侧均拒绝。
9. Redis 未配置时 backend 正常启动，保存和读取返回 `TRACE_REDIS_NOT_CONFIGURED`。
10. Redis URL 指向不可用端口时 backend 正常启动，保存和读取返回 `TRACE_REDIS_UNAVAILABLE`。
11. MCP-over-HTTP `trace-get` 返回完整 JSON。
12. 独立 stdio MCP 进程使用相同 Redis URL 可读取同一 ID。
13. 不存在和已过期 ID 返回 `TRACE_NOT_FOUND`。
14. 非法 ID 返回 `TRACE_INVALID_ID`，且不执行 Redis GET。
15. client timeout、abort、socket close 后 pending Map 归零。
16. hook 同步函数返回后最终能读取完整 trace。
17. hook Promise resolve/reject 后分别保存 `resolved/rejected` 状态。
18. 失败 trace 包含错误名/消息，不包含 Redis 凭据。
19. 测试结束只删除本次生成 key，不调用 `FLUSHDB/FLUSHALL`。

## 9. 严格验收标准

以下每项都是阻断项。任意一项失败，功能不得标记完成。

| ID | 验收标准 | 自动化证据 |
| --- | --- | --- |
| AC-01 | 同步被 hook 函数仍同步返回，值与类型符合 before/after 后的预期 | `tests/sdk-hook.mjs` |
| AC-02 | 被 hook 方法的 `this` 与未包装时相同 | `tests/sdk-hook.mjs` |
| AC-03 | before 可改参、skip；after 可改返回值，执行顺序稳定 | `tests/sdk-hook.mjs` |
| AC-04 | 同步 throw 和 Promise reject 均向调用方抛出原错误对象 | `tests/sdk-hook.mjs` |
| AC-05 | Promise resolve/reject 的 after 都执行一次且仅一次 | `tests/sdk-hook.mjs` |
| AC-06 | 调用链至少包含 fixture 的三级业务调用，顺序正确 | `tests/sdk-hook.mjs` |
| AC-07 | 每帧包含函数名、文件和合法行列；内部 hook 帧被过滤 | `tests/sdk-hook.mjs` |
| AC-08 | 属性 hook 完整恢复 descriptor，恢复函数幂等 | `tests/sdk-hook.mjs` |
| AC-09 | Redis key 使用 `procm:trace:v1:` 前缀并保存版本化 envelope | `tests/trace-redis.mjs` |
| AC-10 | `saveTrace` 只在 Redis SET 成功后 resolve；SET NX 冲突不得覆盖既有记录 | `tests/trace-redis.mjs` |
| AC-11 | 默认 TTL 是 86400 秒，允许误差不超过 2 秒 | `tests/trace-redis.mjs` |
| AC-12 | 自定义 TTL 到期后 tool 返回 `TRACE_NOT_FOUND` | `tests/trace-redis.mjs` |
| AC-13 | SDK 和服务端均拒绝超过 256 KiB 数据，且无残留 key | `tests/trace-redis.mjs` |
| AC-14 | Redis 未配置/不可用不阻止 backend 启动和非 trace 功能 | `tests/trace-redis.mjs` |
| AC-15 | logger 的 JSON 可选包含准确 `traceId` | `tests/trace-logger.mjs` |
| AC-16 | 旧结构化日志仍能解析，`traceId` 缺失不报错 | `tests/trace-logger.mjs` |
| AC-17 | 一次 logger 调用只产生一条 console 输出，hook 自身产生 0 条 | `tests/sdk-hook.mjs`、`tests/trace-logger.mjs` |
| AC-18 | SDK 可并发保存 20 条数据，无串包、丢包和 pending 泄漏 | `tests/trace-redis.mjs` |
| AC-19 | 超时、abort、close 都 reject 且清理 timer/listener/Map | `tests/trace-redis.mjs` |
| AC-20 | MCP HTTP 按 ID 返回与 Redis 一致的完整记录 | `tests/trace-redis.mjs` |
| AC-21 | MCP stdio 按相同 ID 返回与 HTTP 相同的记录 | `tests/trace-redis.mjs` |
| AC-22 | 非法、不存在、过期 ID 返回稳定 JSON 错误码 | `tests/trace-redis.mjs` |
| AC-23 | 同步 hook 不等待 Redis，原函数返回类型和时序不变 | `tests/sdk-hook.mjs`、`tests/trace-redis.mjs` |
| AC-24 | 函数成功、throw、resolve、reject、skip 均保存准确 status | `tests/sdk-hook.mjs`、`tests/trace-redis.mjs` |
| AC-25 | Redis URL/密码不出现在 trace、logger、MCP 错误或业务 stdout | `tests/trace-redis.mjs` |
| AC-26 | SDK TypeScript build 零错误 | `npm run build:sdk` |
| AC-27 | 根项目 build 零错误 | `npm run build` |
| AC-28 | 现有默认测试全部通过，无回归 | `npm test` |
| AC-29 | 真实 Redis 套件全部通过，0 skip | `npm run test:trace:redis` |
| AC-30 | README 包含配置、完整示例、限制、错误码和验收命令 | 文档检查 |

## 10. 测试与验收命令

### 10.1 无外部服务测试

```bash
npm ci
npm run build:sdk
npm run build
npm test
```

通过条件：所有命令退出码为 0；测试汇总 `0 failed`；不得包含新增 skip。

### 10.2 真实 Redis 测试

`tests/docker-compose.yml` 增加：

```yaml
redis-test:
  image: redis:8-alpine
  ports:
    - "16379:6379"
```

执行：

```bash
docker compose -f "tests/docker-compose.yml" up -d redis-test
PROCM_REDIS_URL="redis://127.0.0.1:16379/15" npm run test:trace:redis
docker compose -f "tests/docker-compose.yml" stop redis-test
```

通过条件：Redis 健康；测试退出码为 0；全部用例执行，0 skip；停止后无 procm-mcp 测试进程残留。

### 10.3 手工端到端验收

1. 用 `procm-mcp` 启动一个带 `PROCM_ROOM_ID` 的 Node 示例进程。
2. 示例通过 `createHook` 包装同步函数和异步函数。
3. before 使用 `traceId` 输出一条结构化业务日志。
4. 业务控制台只能看到原业务输出和该条 logger 输出，不得出现调用链正文或 Redis 状态。
5. 从日志取得 `traceId`。
6. 调用 `trace-get`，必须返回函数名、三级调用链、文件、行列、耗时和状态。
7. 等待测试 TTL 后再次查询，必须返回 `TRACE_NOT_FOUND`。

## 11. 失败判定

出现以下任一情况直接判定不合格：

1. 同步函数被包装后变为 Promise。
2. hook 或 Redis SDK 自动调用 `console.*`。
3. Redis 不可用导致 procm-mcp 启动失败或影响进程管理 tool。
4. Redis 凭据进入被管理进程环境、日志、trace 或 MCP 响应。
5. 只有 HTTP 或只有 stdio 注册 `trace-get`。
6. 参数/返回值在未开启 capture 时仍被保存。
7. 旧结构化日志无法解析。
8. payload 超限仍写入 Redis。
9. timeout/abort/断线后仍有 pending 请求或定时器。
10. 测试通过依赖固定 sleep 且无状态轮询，导致明显偶发失败。
11. 真实 Redis 测试被 skip 或仅使用 mock 代替。
12. 为实现变量 hook 而使用不安全的源码重写、eval 或全局 monkey patch。

## 12. 风险与控制

| 风险 | 控制措施 |
| --- | --- |
| 异步调用栈由 V8 重建，不保证跨所有事件边界 | 文档明确首版语义；fixture 只验收 Node 22 可稳定提供的 async stack |
| 参数/返回值包含秘密或巨大对象 | 默认关闭；JSON 安全转换；256 KiB 双侧限制 |
| Redis 短时故障造成大量报错 | 懒连接、稳定错误码、无 console 输出、复用单例 listener |
| hook 改变同步/异常语义 | 专门测试返回类型、同一错误对象、this 和执行次数 |
| 旧服务端不理解新帧 | SDK timeout/error 明确 reject；不修改旧帧语义 |
| HTTP 与 stdio 注册漂移 | 同一 `registerTraceTools` 函数，双入口端到端测试 |
| 测试误删用户 Redis 数据 | 每条使用 UUID key；逐 key 删除；禁止 FLUSH 命令 |

## 13. Definition of Done

只有同时满足以下条件才能结束实现：

1. AC-01 到 AC-30 全部有证据且通过。
2. `npm run build`、`npm test`、`npm run test:trace:redis` 均退出 0。
3. 新增测试没有 `.skip`、`.only` 或基于环境静默跳过。
4. 真实 Redis 测试实际执行 SET、GET、TTL、NX 和连接失败场景。
5. 手工端到端验收确认控制台没有额外追踪噪音。
6. git diff 只包含第 6 节计划文件及必要生成的 lockfile 变更。
7. README 的示例可以直接运行，API 名称与生成的 `.d.ts` 一致。
8. 未解决问题、已知限制和后续优化均记录，不用临时补丁隐藏失败。

## 14. 后续优化（不阻断首版）

1. 使用 source map 映射 TypeScript 原始位置。
2. 提供 Node 专用 `AsyncLocalStorage` logger 自动关联入口。
3. 支持采样率、按耗时阈值保存和自定义脱敏器。
4. Redis 数据压缩及大记录拆分。
5. dashboard 通过 `traceId` 打开详情。
6. 增加按 room/process/time 的受控索引，但需先定义权限和清理成本。
