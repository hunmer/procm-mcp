# dashboard 数据模型

dashboard 的本地持久化全是 localStorage **UI 偏好**（主题、语言、组折叠、置顶、JSON 树开关、系统进程过滤偏好等）；进程数据（含收藏）来自后端 WS/REST，状态在内存中临时持有。

## 前端状态（`App.tsx`）

| state | 类型 | 作用 |
|---|---|---|
| `data` | `ProcessListResponse \| null` | 进程列表（WS 推送填充 + 30s HTTP 轮询兜底） |
| `serverStartedAt` | `number \| null` | 后端启动时间（WS 带），算 uptime |
| `now` | `number` | 每秒 tick，驱动 uptime 显示 |
| `selected` | `ProcessView \| null` | 当前选中查看日志的进程（`?proc=` 恢复） |
| `logCollapsed` | `boolean` | 日志栏是否折叠（独立于 selected，折叠保留选中） |
| `unread` | `Record<string, number>` | 每进程未读日志计数（开 LogPanel 清零） |
| `activeTab` | `"processes" \| "system" \| "history" \| "playground"` | 当前 Tab |
| `toast` | `{message, isError?, key} \| null` | 临时消息（key 强制重渲染） |
| 弹窗开关 | boolean | Clear all / 清空日志确认、Settings、NewProcess 等 |

ref：`openLogIdRef`（当前开日志栏的进程 id，决定未读计数挂谁）、`liveLogForwardRef`（LogPanel 注册的实时日志回调）。

## localStorage 键（UI 偏好）

| key | 归属 | 作用 |
|---|---|---|
| `procm-theme` | `lib/useTheme.ts` | `light`/`dark`，缺省 dark |
| `procm-language` | `lib/useLanguage.ts`/`i18n.ts` | en/zh |
| `procm.collapsedGroups` | `ProcessList.tsx` | 折叠的组名集合（Collapsible 组折叠状态） |
| `procm.pinnedProcesses` | `ProcessList.tsx` | 置顶的进程 id（行 pin 置顶） |
| `procm-log-show-json` | `log-panel/constants.ts` | 结构化 JSON 是否渲染为交互树（ViewSettings 开关） |
| `procm.sysLive` / `procm.sysInterval` / `procm.sysPortsOnly` | `system-process/types.ts` | 系统进程自动刷新开关/间隔（1/2/3/5s）/仅 HTTP 端口过滤 |

> 收藏**不再**有 localStorage 键（原 `procm-favorites` 已随 `lib/favorites.ts` 删除）；`procm-processes.json` 是 SettingsDialog 导出**下载的文件名**，不是存储键。

## 后端镜像类型（`lib/types.ts`）

见 [public-interfaces.md](public-interfaces.md)。`ProcessView`（17 字段，含 `group?`/`favorite?`/`port?`/`roomId?`）是核心展示模型；`WsProcessesMessage`/`WsLogMessage`（含 `logCleared`）是 WS 消息形状。`LogsResponse.text` 是 LogPanel 渲染的纯文本（多行，每行带 `[ISO] ` 前缀，由后端拼接）。

## WebSocket 状态（`lib/ws.ts`）

| state | 作用 |
|---|---|
| `status` | 连接状态 |
| `reconnectInMs` | `number \| null`，重连回退倒计时（断线态显示） |
| `processesRef`/`logRef` 等 | ref，存最新回调（processes/log/logCleared），避免内联回调触发重订阅 |

组件卸载主动关闭 + 清 timer；断线自动重连并显示回退倒计时。

## LogPanel 局部状态（`log-panel/`）

| state | 作用 |
|---|---|
| `entries` | `LogEntry[]`（合并 stdout+stderr，按时间） |
| `loading` / `error` | 加载与错误态 |
| `reqId` | ref，自增请求序号，丢弃过期响应（防快速切换竞态） |
| 字号 / level 过滤 / showJson | `LogPanelViewSettings`（popover）：`FontSize`（xs/sm/md）+ `LevelFilter`（debug/info/warn/error 多选，空选=全部）+ JSON 树开关（持久化 `procm-log-show-json`） |
| 搜索 / stdin | Header 搜索、`LogPanelStdinBar` 的 stdin 输入与信号菜单 |

REST 拉历史（`getMergedLogs`/`grepMergedLogs`，常量 `HISTORY_COUNT=100`/`GREP_COUNT=500` 在 `log-panel/constants.ts`），WS 实时行经 App `onLiveLog` 回调追加，`logCleared` 时重置缓冲。

## Favorites（服务端字段，非 localStorage）

- `ProcessView.favorite?: boolean`，随 WS 快照/推送下发；`lib/api.ts` 的 `setProcessFavorite(id, favorite)` → `PATCH /api/processes/:id` 改动。
- 「收藏一条启动配方」的旧诉求改由 SettingsDialog data Tab 承接：导出下载 `procm-processes.json` / 导入上传 JSON 逐条 `POST /api/processes/import` 重建（不启动）。
- 目录扫描导入（ImportGroupDialog）走 `POST /api/favorites/scan`（候选）+ `POST /api/processes/import-batch`（批量）。

## 主题持久化（`lib/useTheme.ts`）

- 存储 key：`localStorage["procm-theme"]`，值 `light`/`dark`，缺省 `dark`。
- 应用方式：`document.documentElement.classList.toggle("dark", theme==="dark")`。
- `initTheme()` 在渲染前同步执行（避免 FOUC）；`useTheme()` 在 state 变化时持久化 + 应用。

## NewProcessDialog 表单

本地受控 state：`name/script/args/cwd/envs`（字符串）+ presets 快填（`lib/presets`：counter/slow-log/http-server/ping/level-log 5 个 demo，`${cwd}` 占位符按 `detectCwd` 插值，`applyPreset` 只覆盖已定义字段）。提交时 `args` 按空白切成数组，`envs` 经 `parseEnvs`（每行 `KEY=VALUE`）转对象，POST 后 `reset()` 关闭。
