# dashboard 模块职责

`dashboard/src/` 是一个 React 应用：编排大组件在 `components/` 根，子组件拆在 `components/{log-panel,process-list,system-process,playground}/` 子目录；`lib/`（8 文件）承载数据/通信/前端领域逻辑；`registry/` 是 vendored coss 组件；i18n 经 `i18n.ts` + `locales/` 提供 en/zh 双语（16 个顶层域）。

## 文件职责

| 文件 | 职责 |
|---|---|
| `main.tsx` | **入口**。`initTheme()`（首屏前应用持久化主题）→ `createRoot(#root).render(<App/>)`，包 `StrictMode`，引入 `index.css`。 |
| `i18n.ts` | **i18next 初始化**（en/zh 资源、语言探测：localStorage `procm-language` → 浏览器偏好 → 英文）；`LANGUAGES`/`LANGUAGE_LABELS`。 |
| `components/App.tsx` | **顶层容器**。四个 Tab：processes（`ProcessList` + 右侧 `LogPanel`，宽 `min(640px,46vw)`）、system（`SystemProcessList`）、history（`LogFilesView` 落盘日志浏览）、playground（`Playground`）。顶栏：后端身份 Badge（port·serverId(pid)）、running 计数、Clear all / 清空日志 AlertDialog。接线 WS（`onProcessesMessage`/`onLogMessage`）+ 未读日志计数 + `?proc=` 恢复选中；每秒 uptime tick；30s HTTP 轮询兜底；DevInspector。 |
| `components/ProcessList.tsx` | **进程列表外壳与分组**。按 `ProcessView.group` 分组：空组归 Ungrouped（垫底固定上方），命名组字母序。Collapsible 组折叠（localStorage `procm.collapsedGroups`）；行 pin 置顶（`procm.pinnedProcesses`）；组头 +（预填组名新建）/铅笔（触发 RenameGroupDialog）/路径样式组（`looksLikePath` 正则）有「打开文件夹」；Ungrouped 有清空（bulk delete）。拼装 `process-list/` 子域。 |
| `components/process-list/` | **进程列表子域（11 文件）**。`useProcessActions.ts`（单个/批量操作 mutation）、`ProcessFilterBar.tsx`（过滤：status `all/running/spawning/exited/error/expired`（expired 为 UI-only=stoppedAt!=null）、sort `none/startedAt`、name 搜索（匹配 name/script/desc）+ `CreateDropdown`；**无 group 过滤器**）、`ProcessCard.tsx`/`ProcessCardBody.tsx`（进程卡片与内容）、`ProcessActions.tsx`（操作按钮组）、`ProcessContextMenu.tsx`（行右键菜单）、`ProcessDialogs.tsx`（详情等弹窗）、`ProcessLogFilesDialog.tsx`（单进程落盘日志文件弹窗，内嵌 `LogFilesView`）、`RenameGroupDialog.tsx`（组重命名：把该组全部进程经 `updateProcess(id,{group})` 批量搬移到新组名，留空移入 Ungrouped；ids 取未过滤列表避免漏搬）、`types.ts`/`utils.ts`（`canStopProcess` 等局部工具）。 |
| `components/SystemProcessList.tsx` (+ `system-process/` 子域) | **System Tab**：OS 级进程列表（`GET /api/system-processes`：pid/ppid/name/cmd/exe/ports），同名同父进程合并展示、kill 确认。状态/轮询/过滤在组合层。 |
| `components/system-process/` | **System Tab 子域（11 文件）**。`SystemProcessTableView.tsx`（@tanstack/react-table 表格视图）、`useSystemProcessColumns.tsx`（列定义/kill 确认）、`SortableHeader.tsx`（排序表头）、`SystemProcessFilterBar.tsx`（name/path/cmd 三搜索框 + HTTP ports only 开关 + 自动刷新 1/2/3/5s，偏好 localStorage `procm.sys*`）、`SystemProcessBadges.tsx`（×N 合并行/端口徽章）、`SystemProcessContextMenu.tsx`（查看信息/打开位置/Kill）、`SystemProcessDialogs.tsx`（弹窗）、`SystemProcessInfo.tsx`（只读信息体，对话框与右面板复用）、`SystemProcessInfoPanel.tsx`（右侧面板）、`types.ts`（`ProcessRow` 同名同父合并展示）、`utils.ts`（localStorage 小工具）。 |
| `components/LogPanel.tsx` | **内联右栏日志编排者**。拼装 `log-panel/` 子域；REST 拉历史 + WS 实时追加（经 App 转发的 `onLiveLog`），`reqId` ref 防竞态。 |
| `components/log-panel/` | **日志面板子域（9 文件）**。`LogPanelHeader.tsx`（进程名/ID、状态徽章、重启/停止、搜索、复制、关闭）、`LogPanelBody.tsx`（日志渲染 + 空/错/已关态）、`LogPanelFooter.tsx`（复制文本、下载、清空日志（`DELETE /api/processes/:id/logs`）、打开日志文件/文件夹）、`LogPanelCommandStrip.tsx`（启动命令只读条）、`LogPanelStdinBar.tsx`（stdin 输入 + 信号菜单）、`LogPanelStopDialog.tsx`（停止确认）、`LogPanelViewSettings.tsx`（字号/level 过滤/JSON 树开关 popover）、`constants.ts`（`HISTORY_COUNT`/`GREP_COUNT`、showJson 持久化 `procm-log-show-json`）、`types.ts`（`FontSize`/`LevelFilter`）。 |
| `components/LogFilesView.tsx` | **History Tab**：历史落盘日志文件浏览（`GET /api/log-files` 清单、内容读取、清空 `DELETE /api/log-files`）。 |
| `components/playground/` | **Playground Tab（2 文件）**。`Playground.tsx`：左栏按类别列端点，右侧 zod 校验表单直接向同源发请求，响应用 `JsonViewer` 树展示，可复制等价 curl（按 OS 选引号风格）。`catalog.ts`：端点目录（32 端点、6 组：server/processes/rooms/system/files/logs），镜像后端 `src/http-server.ts` 路由，排除静态 `/`、`/mcp`、log-download。 |
| `components/NewProcessDialog.tsx` | **新建进程弹窗** + ProcessDetailsDialog。表单含 presets 快填（`lib/presets`）。遵守 form-in-dialog 不变量。 |
| `components/SettingsDialog.tsx` | **设置弹窗**，垂直 3 Tab——general（语言、主题）、data（启动配方导出下载 `procm-processes.json` / 导入上传 JSON 逐条 `POST /api/processes/import` 重建不启动）、logs（server log 设置：debug.log 单文件大小上限 MB（`PUT /api/server-log/settings`）、清空恢复默认 20MB/env、文件数与总大小摘要、Clear logs=`DELETE /api/server-log`、Open log folder）。 |
| `components/ImportGroupDialog.tsx` | 目录导入弹窗：输入路径调 `POST /api/favorites/scan`（目录扫描候选）→ 勾选 → 批量导入进程记录（`POST /api/processes/import-batch`）。 |
| `components/CreateDropdown.tsx` | 过滤栏的「新建」下拉（触发 NewProcessDialog 等）。 |
| `components/TerminalLog.tsx` | **终端日志渲染**：`tokenizeAnsi`（`ansi.ts`）把 ANSI SGR 转带样式片段；结构化日志的 `data` 字段经 `JsonViewer` 展开；搜索命中 `<mark>` 高亮。 |
| `components/ansi.ts` | **ANSI SGR 解析器**：16 色调色板 + 前景/背景/加粗等属性分段；非 SGR 控制序列（光标/清屏/OSC）丢弃。 |
| `components/JsonViewer.tsx` | 交互式 JSON 树（coss Popover/Dialog 原语，Tailwind 配色；自 agent_spaces 移植）。 |
| `components/StatusBadge.tsx` | 按 `ProcessStatus` 映射 coss `Badge` variant。 |
| `components/Toast.tsx` | 内联瞬时 toast（非 coss 原语），2.8s 自动消失。 |
| `components/DevInspector.tsx` | dev-only 组件检查器（`react-dev-inspector`，生产环境渲染空；Ctrl+Shift+Alt+C 热键）。 |
| `lib/api.ts` | **REST 客户端**（8 文件之一）。`api<T>()` 同源 fetch 封装，非 2xx 抛带 `error` 消息；从 `@hunmer/procm-mcp-sdk` import `decodeStructuredLogLine`/`stripStructuredLogFrame` 还原结构化日志（解析+合并）。导出进程 CRUD（list/get/start/stop/restart/delete/clearAll）、`updateProcess`（同入口可发 `{group: string\|null}` 或 `{favorite}`）、`setProcessFavorite`、`clearProcessLogs`（DELETE logs）、merged/grep 日志、logFiles/downloadUrl/command、server log（`getServerLogInfo`/`updateServerLogMaxBytes`/`clearServerLogs`）、落盘日志（`listLogFiles`/`readLogFileContent`/`clearLogFiles`）、导入（`saveImportedProcess`/`batchImportProcesses`）、`scanDirectory`、`openFolder`、`systemProcesses`、`selectDirectory`（POST /api/select-directory）+ `parseEnvs/stringifyEnvs/parseLogText/mergeEntries`。 |
| `lib/ws.ts` | **WebSocket hook** `useDashboardSocket`。同源 `/ws` 连接，断线自动重连 + 回退倒计时；回调存 ref（不触发重订阅）；processes/log/logCleared 三类回调。 |
| `lib/types.ts` | 镜像后端：`ProcessStatus`/`ProcessView`（17 字段）/`ProcessListResponse`/`LogsResponse`/`LogEntry`/`StartProcessBody`/`ServerLogInfo`/`LogFileSummary`/WS 消息类型（含 `logCleared`）。 |
| `lib/urlState.ts` | **URL 状态同步**：选中进程（`?proc=`）与日志面板折叠（`?collapsed=`）写入 URL，刷新/分享可还原视图；`history.replaceState` 不产生历史记录。 |
| `lib/presets.ts` | **启动预设**（新建进程表单 quick-fill）：counter/slow-log/http-server/ping/level-log 5 个 demo，`${cwd}` 占位符按 `detectCwd` 插值，`applyPreset` 只覆盖已定义字段。 |
| `lib/cwd.ts` | `detectCwd()` 从 `GET /api/meta` 读后端 cwd。 |
| `lib/useTheme.ts` | 主题 hook：localStorage `procm-theme`（缺省 dark）、`initTheme`（同步应用防 FOUC）、`useTheme()`。 |
| `lib/useLanguage.ts` | 语言 hook（`useTheme` 的镜像模式）：localStorage 持久化 + 应用到 i18next 实例与 `<html lang>`。 |
| `index.css` | Tailwind v4 入口 + 自定义主题 token（显式 hex/rgb，`:root` 亮 / `.dark` 暗）。 |
| `registry/default/lib/utils.ts` | `cn()` = `twMerge(clsx(...))`。 |
| `registry/default/ui/*.tsx` | **vendored coss 组件**，来源 coss registry，按需拷贝。 |

## 子域划分

- **应用层**：`main.tsx`、`i18n.ts`、`components/*.tsx`（编排大文件）、`components/{process-list,system-process,log-panel,playground}/*`。
- **数据/通信层**：`lib/api.ts`（REST）、`lib/ws.ts`（WebSocket）、`lib/types.ts`。
- **前端领域**：`lib/presets.ts`、`lib/cwd.ts`、`lib/urlState.ts`。
- **主题/语言**：`lib/useTheme.ts`、`lib/useLanguage.ts`、`locales/`、`index.css`。
- **UI 原语（vendored）**：`registry/default/ui/*` + `registry/default/lib/utils.ts`。

## 数据流

```
useDashboardSocket ──WS /ws──► 后端 dashboardEvents
  ├─ onProcessesMessage ──► setData（进程列表，含历史）
  └─ onLogMessage ──► 匹配 openLogId? 转发 LogPanel : 累加 unread
App（另有 30s HTTP 轮询兜底）
  ├─► ProcessList（分组 + process-list/ 子域）──REST──► /api/processes*（start/restart/stop/delete/更新 group/favorite/批量）
  ├─► SystemProcessList（system-process/ 子域）──REST──► /api/system-processes（列表 + kill）
  ├─► LogPanel(selected)（log-panel/ 子域）──REST──► /api/processes/:id/logs (+ WS 实时) ──► TerminalLog(ANSI) / JsonViewer
  ├─► LogFilesView ──REST──► /api/log-files*（落盘日志浏览）
  ├─► Playground ──REST──► catalog.ts 覆盖的全部端点（同源直发）
  ├─► NewProcessDialog ──POST──► /api/processes
  ├─► SettingsDialog ──REST──► /api/processes/import（导入）· /api/server-log*（日志设置）
  └─► urlState ──► ?proc= &collapsed=（URL 同步）
```
