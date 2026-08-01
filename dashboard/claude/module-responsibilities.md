# dashboard 模块职责

`dashboard/src/` 是一个平铺的 React 应用，按 `components/`、`lib/`、`registry/` 分组。

## 文件职责

| 文件 | 职责 |
|---|---|
| `main.tsx` | **入口**。`initTheme()`（首屏前应用持久化主题，避免闪烁）→ `createRoot(#root).render(<App/>)`，包 `StrictMode`，引入 `index.css`。 |
| `components/App.tsx` | **顶层容器**。状态：进程列表 `data`、WS 状态、后端 uptime、选中进程 `selected`、日志折叠 `logCollapsed`、未读 `unread`、当前 Tab（processes/favorites）、toast、favorites、各种弹窗开关。接线 WS（`onProcessesMessage`/`onLogMessage`），管理未读计数与实时日志转发，启动收藏后自动选中并开日志栏。header（连接灯/uptime/New/主题）+ 双 Tab + 分栏 + 弹窗。 |
| `components/ProcessList.tsx` | 进程表格（@tanstack/react-table）：Name/Command/Status/PID 等列 + 行右键菜单（Logs/Restart/Stop/View/Copy command/Favorite/...）。未读徽标、收藏星标。 |
| `components/LogPanel.tsx` | **内联右栏日志**。stdout/stderr 切换、grep 搜索、count、复制/下载/打开日志文件位置、复制启动命令。REST 拉历史 + WS 实时追加（经 App 转发的 `onLiveLog`）。`reqId` ref 防竞态。 |
| `components/NewProcessDialog.tsx` | **新建进程弹窗** + ProcessDetailsDialog + FavoriteDialog（收藏编辑，新建/编辑两态）。表单含 presets 快填（来自 `lib/presets`）。遵守 form-in-dialog 不变量。 |
| `components/ImportFavoritesDialog.tsx` | 文件夹导入弹窗：输入路径调 `scanDirectory` → 勾选候选 → 批量加入收藏。 |
| `components/FavoritesView.tsx` | Favorites Tab 的收藏网格（按分类分组卡片）：Launch/Edit/Remove、分组打开文件夹、分组删除、触发导入。 |
| `components/StatusBadge.tsx` | 按 `ProcessStatus` 映射 coss `Badge` variant（running→success, spawning→warning, exited→secondary, error→error）。 |
| `components/Toast.tsx` | 内联瞬时 toast（非 coss 原语），2.8s 自动消失，`role="status"`。 |
| `components/DevInspector.tsx` | dev-only 组件检查器（`react-dev-inspector`，生产环境渲染空）。 |
| `lib/api.ts` | **REST 客户端**。`api<T>()` 同源 fetch 封装，非 2xx 抛带 `error` 消息。导出 list/get/logs/grep/mergedLogs/start/stop/restart/delete/clearAll/logFiles/downloadUrl/command/scanDirectory/openFolder/parseEnvs/stringifyEnvs/parseLogText/mergeEntries。 |
| `lib/ws.ts` | **WebSocket hook** `useDashboardSocket`。同源 `/ws` 连接，指数退避（cap 10s）自动重连，回调存 ref（不触发重订阅）。返回 status/reconnectInMs/onProcessesMessage/onLogMessage。 |
| `lib/types.ts` | 镜像后端：`ProcessStatus`/`ProcessView`(含 startedAt?/stoppedAt?)/`ProcessListResponse`/`LogsResponse`/`LogEntry`/`StartProcessBody`/`WsProcessesMessage`/`WsLogMessage`。 |
| `lib/useTheme.ts` | 主题 hook：`readStoredTheme`（localStorage `procm-theme`，缺省 dark）、`initTheme`（同步应用，避免 FOUC）、`useTheme()`（state + 持久化 + toggle）。 |
| `lib/favorites.ts` | **Favorites 模型与 localStorage 存储**。`Favorite` 接口、`favoriteFromProcess`/`favoriteToStartBody`/`favoriteSignature`(去重键)/`categoryLabel`、`useFavorites()` hook（CRUD + 持久化）。存储 key `procm-favorites`。 |
| `lib/presets.ts` | **启动预设** hook `useProcessPresets`。内置 demo 脚本（counter/slow-log/http-server/ping），`${cwd}` 占位符按检测到的 repo 根解析，`applyPreset` 只覆盖预设定义的字段。 |
| `lib/cwd.ts` | `detectCwd()` 从 `GET /api/meta` 读后端 cwd，供 presets 自动填充（best-effort，失败返回 ""）。 |
| `index.css` | Tailwind v4 入口 + 自定义主题 token（显式 hex/rgb，`:root` 亮 / `.dark` 暗）+ base 层。 |
| `registry/default/lib/utils.ts` | `cn()` = `twMerge(clsx(...))`，coss 组件依赖。 |
| `registry/default/ui/*.tsx` | **vendored coss 组件**：alert/alert-dialog/badge/button/card/checkbox/checkbox-group/context-menu/dialog/empty/field/input/label/menu/pagination/preview-card/scroll-area/select/separator/spinner/table/textarea 等。来源 coss registry，按需拷贝。 |

## 子域划分

- **应用层**：`main.tsx`、`components/*.tsx`。
- **数据/通信层**：`lib/api.ts`（REST）、`lib/ws.ts`（WebSocket）、`lib/types.ts`。
- **前端领域**：`lib/favorites.ts`（收藏）、`lib/presets.ts`（预设）、`lib/cwd.ts`。
- **主题**：`lib/useTheme.ts`、`index.css`。
- **UI 原语（vendored）**：`registry/default/ui/*` + `registry/default/lib/utils.ts`。

## 数据流

```
useDashboardSocket ──WS /ws──► 后端 dashboardEvents
  ├─ onProcessesMessage ──► setData（进程列表，含历史）+ pendingSelect 自动开日志栏
  └─ onLogMessage ──► 匹配 openLogId? 转发 LogPanel : 累加 unread
App
  ├─► ProcessList ──► restartProcess/stopProcess/deleteProcessCall ──REST──► /api/.../{restart,stop} / DELETE
  │      └ onSelectLogs/onView/onToggleFavorite
  ├─► LogPanel(selected) ──► getMergedLogs/grepMergedLogs ──REST──► /api/processes/:id/logs (+ WS 实时)
  ├─► NewProcessDialog ──► startProcess ──POST──► /api/processes
  ├─► FavoritesView ──► startProcess(launch) / scanDirectory(import) / openFolder
  └─► clearAll ──► clearAllProcesses(ids) ──DELETE──► /api/processes（批量）
```
