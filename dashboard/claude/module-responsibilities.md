# dashboard 模块职责

`dashboard/src/` 是一个平铺的 React 应用，按 `components/`（含 `process-list/` 子目录）、`lib/`、`registry/` 分组，i18n 经 `i18n.ts` + `locales/` 提供 en/zh 双语。

## 文件职责

| 文件 | 职责 |
|---|---|
| `main.tsx` | **入口**。`initTheme()`（首屏前应用持久化主题）→ `createRoot(#root).render(<App/>)`，包 `StrictMode`，引入 `index.css`。 |
| `i18n.ts` | **i18next 初始化**（en/zh 资源、语言探测：localStorage `procm-language` → 浏览器偏好 → 英文）；`LANGUAGES`/`LANGUAGE_LABELS`。 |
| `components/App.tsx` | **顶层容器**。状态：进程列表 `data`、WS 状态、选中进程、日志折叠/未读、Tab（processes/favorites/system 等）、toast、favorites、弹窗开关。接线 WS（`onProcessesMessage`/`onLogMessage`），未读计数与实时日志转发，启动收藏后自动选中并开日志栏。header（连接灯/New/主题/语言）+ 多 Tab + 分栏 + 弹窗编排。 |
| `components/process-list/` | **进程列表子域（组合式，13 文件）**。`ProcessList.tsx`（外壳）拼装：`useProcessActions`（批量/单个操作 mutation）、`useProcessColumns`（@tanstack/react-table 列定义）、`ProcessTableView`/`ProcessCardsView`（表格/卡片双视图，`utils.loadViewMode` 持久化切换）、`ProcessFilterBar`（搜索/状态过滤）、`ProcessPagination`（分页）、`SortableHeader`（列排序）、`ProcessContextMenu`（行右键菜单）、`ProcessActions`/`ProcessCardBody`（卡片操作/内容）、`ProcessDialogs`（详情等弹窗）、`types.ts`（视图局部类型）。 |
| `components/SystemProcessList.tsx` (+ `system-process/` 子域) | **System Tab**：OS 级进程列表（`GET /api/system-processes`：pid/ppid/name/cmd/exe/ports），搜索/开关过滤、选中 kill。状态/轮询/过滤在组合层；列定义、表格视图、工具栏、右键菜单、详情面板、弹窗拆在 `system-process/`（同 process-list 模式）。 |
| `components/LogPanel.tsx` | **内联右栏日志**。stdout/stderr 切换、grep 搜索、count、复制/下载/打开日志文件位置、复制启动命令。REST 拉历史 + WS 实时追加（经 App 转发的 `onLiveLog`）。`reqId` ref 防竞态。 |
| `components/TerminalLog.tsx` | **终端日志渲染**：`tokenizeAnsi`（`ansi.ts`）把 ANSI SGR 转带样式片段；结构化日志的 `data` 字段经 `JsonViewer` 展开；搜索命中 `<mark>` 高亮。 |
| `components/ansi.ts` | **ANSI SGR 解析器**：16 色调色板 + 前景/背景/加粗等属性分段；非 SGR 控制序列（光标/清屏/OSC）丢弃。 |
| `components/JsonViewer.tsx` | 交互式 JSON 树（coss Popover/Dialog 原语，Tailwind 配色；自 agent_spaces 移植）。 |
| `components/NewProcessDialog.tsx` | **新建进程弹窗** + ProcessDetailsDialog + FavoriteDialog（收藏编辑，新建/编辑两态）。表单含 presets 快填（`lib/presets`）。遵守 form-in-dialog 不变量。 |
| `components/ImportFavoritesDialog.tsx` | 文件夹导入弹窗：输入路径调 `scanDirectory` → 勾选候选 → 批量加入收藏。 |
| `components/FavoritesView.tsx` | Favorites Tab 的收藏网格（按分类分组卡片）：Launch/Edit/Remove、分组打开文件夹、分组删除、触发导入。 |
| `components/StatusBadge.tsx` | 按 `ProcessStatus` 映射 coss `Badge` variant。 |
| `components/Toast.tsx` | 内联瞬时 toast（非 coss 原语），2.8s 自动消失。 |
| `components/DevInspector.tsx` | dev-only 组件检查器（`react-dev-inspector`，生产环境渲染空；Ctrl+Shift+Alt+C 热键）。 |
| `lib/api.ts` | **REST 客户端**。`api<T>()` 同源 fetch 封装，非 2xx 抛带 `error` 消息。从 `@procm-mcp/sdk` import `decodeStructuredLogLine`/`stripStructuredLogFrame` 还原结构化日志。导出 list/get/logs/grep/mergedLogs/start/stop/restart/delete/clearAll/logFiles/downloadUrl/command/scanDirectory/openFolder/systemProcesses 等 + `parseEnvs/stringifyEnvs/parseLogText/mergeEntries`。 |
| `lib/ws.ts` | **WebSocket hook** `useDashboardSocket`。同源 `/ws` 连接，指数退避（cap 10s）自动重连，回调存 ref（不触发重订阅）。 |
| `lib/types.ts` | 镜像后端：`ProcessStatus`/`ProcessView`/`ProcessListResponse`/`LogsResponse`/`LogEntry`/`StartProcessBody`/`WsProcessesMessage`/`WsLogMessage`。 |
| `lib/urlState.ts` | **URL 状态同步**：选中进程（`?proc=`）与日志面板折叠（`?collapsed=1`）写入 URL，刷新/分享可还原视图；`history.replaceState` 不产生历史记录。 |
| `lib/useTheme.ts` | 主题 hook：localStorage `procm-theme`（缺省 dark）、`initTheme`（同步应用防 FOUC）、`useTheme()`。 |
| `lib/useLanguage.ts` | 语言 hook（`useTheme` 的镜像模式）：localStorage 持久化 + 应用到 i18next 实例与 `<html lang>`。 |
| `lib/favorites.ts` | **Favorites 模型与 localStorage 存储**（key `procm-favorites`）。`Favorite` 接口、`favoriteFromProcess`/`favoriteToStartBody`/`favoriteSignature`/`categoryLabel`、`useFavorites()` hook。 |
| `lib/presets.ts` | **启动预设** hook `useProcessPresets`。内置 demo 脚本，`${cwd}` 占位符按 `detectCwd` 解析，`applyPreset` 只覆盖预设定字段。 |
| `lib/cwd.ts` | `detectCwd()` 从 `GET /api/meta` 读后端 cwd。 |
| `index.css` | Tailwind v4 入口 + 自定义主题 token（显式 hex/rgb，`:root` 亮 / `.dark` 暗）。 |
| `registry/default/lib/utils.ts` | `cn()` = `twMerge(clsx(...))`。 |
| `registry/default/ui/*.tsx` | **vendored coss 组件**（26 个），来源 coss registry，按需拷贝。 |

## 子域划分

- **应用层**：`main.tsx`、`i18n.ts`、`components/*.tsx`、`components/process-list/*`。
- **数据/通信层**：`lib/api.ts`（REST）、`lib/ws.ts`（WebSocket）、`lib/types.ts`。
- **前端领域**：`lib/favorites.ts`、`lib/presets.ts`、`lib/cwd.ts`、`lib/urlState.ts`。
- **主题/语言**：`lib/useTheme.ts`、`lib/useLanguage.ts`、`locales/`、`index.css`。
- **UI 原语（vendored）**：`registry/default/ui/*` + `registry/default/lib/utils.ts`。

## 数据流

```
useDashboardSocket ──WS /ws──► 后端 dashboardEvents
  ├─ onProcessesMessage ──► setData（进程列表，含历史）+ pendingSelect 自动开日志栏
  └─ onLogMessage ──► 匹配 openLogId? 转发 LogPanel : 累加 unread
App
  ├─► ProcessList（process-list/ 组合）──REST──► /api/processes*（start/restart/stop/delete/批量）
  ├─► SystemProcessList ──REST──► /api/system-processes（列表 + kill）
  ├─► LogPanel(selected) ──REST──► /api/processes/:id/logs (+ WS 实时) ──► TerminalLog(ANSI) / JsonViewer
  ├─► NewProcessDialog ──POST──► /api/processes
  ├─► FavoritesView ──► startProcess / scanDirectory / openFolder
  └─► urlState ──► ?proc= &collapsed=（URL 同步）
```
