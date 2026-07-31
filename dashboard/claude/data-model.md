# dashboard 数据模型

dashboard 无自有持久化——所有状态来自后端 REST 响应，或在前端内存中临时持有。

## 前端状态（`App.tsx`）

| state | 类型 | 作用 |
|---|---|---|
| `data` | `ProcessListResponse \| null` | 进程列表（含 serverId/pid） |
| `meta` | `string` | header 显示的「server ... (pid ...) · 时间」或错误 |
| `auto` | `boolean` | 3s 自动刷新开关 |
| `selected` | `ProcessView \| null` | 当前选中查看日志的进程 |
| `logCollapsed` | `boolean` | 日志栏是否折叠（独立于 selected，折叠保留选中） |
| `toast` | `{message, isError?, key} \| null` | 临时消息（key 用于强制重渲染） |
| `theme` | `"light"\|"dark"` | 来自 `useTheme` |

`autoTimer` 是 `useRef` 持有的 interval id。

## 后端镜像类型（`lib/types.ts`）

见 [public-interfaces.md](public-interfaces.md)。`ProcessView` 是核心展示模型，`LogsResponse.text` 是 LogPanel 渲染的纯文本（多行，每行带 `[ISO] ` 前缀，由后端拼接）。

## LogPanel 局部状态

| state | 作用 |
|---|---|
| `stream` | `"stdout" \| "stderr"` |
| `count` | number，默认 200 |
| `text` | 日志文本 / 提示 |
| `loading` / `error` | 加载与错误态 |
| `reqId` | ref，自增请求序号，丢弃过期响应（防快速切换的竞态） |

`useEffect` 依赖 `[process.id, stream, count]`，任一变化重取；cleanup 设 `cancelled = true`。

## 主题持久化（`lib/useTheme.ts`）

- 存储 key：`localStorage["procm-theme"]`，值 `light`/`dark`，缺省 `dark`。
- 应用方式：`document.documentElement.classList.toggle("dark", theme==="dark")`。
- `initTheme()` 在渲染前同步执行（避免 FOUC）；`useTheme()` 在 state 变化时持久化 + 应用。

## NewProcessDialog 表单

本地受控 state：`name/script/args/cwd/envs`（字符串）。提交时 `args` 按空白切成数组，`envs` 经 `parseEnvs`（每行 `KEY=VALUE`）转对象，POST 后 `reset()` 关闭。
