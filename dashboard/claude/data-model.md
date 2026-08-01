# dashboard 数据模型

dashboard 的持久化只有两类 localStorage（主题、收藏）；其余状态来自后端 WS/REST 响应，或在内存中临时持有。

## 前端状态（`App.tsx`）

| state | 类型 | 作用 |
|---|---|---|
| `data` | `ProcessListResponse \| null` | 进程列表（WS 推送填充） |
| `serverStartedAt` | `number \| null` | 后端启动时间（WS 带），算 uptime |
| `now` | `number` | 每秒 tick，驱动 uptime 显示 |
| `selected` | `ProcessView \| null` | 当前选中查看日志的进程 |
| `logCollapsed` | `boolean` | 日志栏是否折叠（独立于 selected，折叠保留选中） |
| `viewing`/`detailsOpen` | ProcessView/boolean | 进程详情只读弹窗 |
| `toast` | `{message, isError?, key} \| null` | 临时消息（key 强制重渲染） |
| `unread` | `Record<string, number>` | 每进程未读日志计数（开 LogPanel 清零） |
| `activeTab` | `"processes" \| "favorites"` | 当前 Tab |
| `favOpen`/`favSeedProcess`/`favSeedFavorite` | 弹窗开关 + 种子 | 收藏编辑弹窗（新建/编辑两态） |
| `clearAllOpen`/`importOpen` | boolean | Clear all / 文件夹导入弹窗 |

ref：`openLogIdRef`（当前开日志栏的进程 id，决定未读计数挂谁）、`liveLogForwardRef`（LogPanel 注册的实时日志回调）、`pendingSelectRef`（启动收藏后待自动选中的进程 id）。

## 后端镜像类型（`lib/types.ts`）

见 [public-interfaces.md](public-interfaces.md)。`ProcessView`（含 `startedAt?`/`stoppedAt?`）是核心展示模型；`WsProcessesMessage`/`WsLogMessage` 是 WS 消息形状。`LogsResponse.text` 是 LogPanel 渲染的纯文本（多行，每行带 `[ISO] ` 前缀，由后端拼接）。

## WebSocket 状态（`lib/ws.ts`）

| state | 作用 |
|---|---|
| `status` | `"connecting" \| "open" \| "closed"` |
| `reconnectInMs` | `number \| null`，下次重连倒计时（closed 态） |
| `processesRef`/`logRef` | ref，存最新回调，避免内联回调触发重订阅 |

`useEffect` 建连接，`onclose`（非主动关）触发指数退避（`1000 * 2**attempt`，cap 10s）重连 + 倒计时显示。组件卸载 `closedByUs=true` + 清 timer。

## LogPanel 局部状态

| state | 作用 |
|---|---|
| `stream` | `"stdout" \| "stderr"` |
| `count` / `grep` / `ignoreCase` | 日志参数 |
| `entries` | `LogEntry[]`（合并 stdout+stderr，按时间） |
| `loading` / `error` | 加载与错误态 |
| `reqId` | ref，自增请求序号，丢弃过期响应（防快速切换竞态） |

REST 拉历史（`getMergedLogs`/`grepMergedLogs`），WS 实时行经 App `onLiveLog` 回调追加。

## Favorites（`lib/favorites.ts`，localStorage）

```ts
interface Favorite { id; name?; desc?; script; args[]; cwd; envs?; category?; createdAt }
```

- 存储 key：`localStorage["procm-favorites"]`（JSON 数组）。
- `favoriteSignature(f)` = `script\0args.join(" ")\0cwd`，去重键（启动等价）。
- `useFavorites()` hook 提供 `favorites`/`addFavorite`(返回是否新增，自动去重)/`removeFavorite`/`updateFavorite`。
- 分类标签 `categoryLabel` 把空白折叠为 "Uncategorized"。

## 主题持久化（`lib/useTheme.ts`）

- 存储 key：`localStorage["procm-theme"]`，值 `light`/`dark`，缺省 `dark`。
- 应用方式：`document.documentElement.classList.toggle("dark", theme==="dark")`。
- `initTheme()` 在渲染前同步执行（避免 FOUC）；`useTheme()` 在 state 变化时持久化 + 应用。

## NewProcessDialog 表单

本地受控 state：`name/script/args/cwd/envs`（字符串）+ presets 快填（`lib/presets`，`${cwd}` 占位符按 `detectCwd` 解析）。提交时 `args` 按空白切成数组，`envs` 经 `parseEnvs`（每行 `KEY=VALUE`）转对象，POST 后 `reset()` 关闭。
