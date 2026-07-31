# dashboard 模块职责

`dashboard/src/` 是一个平铺的 React 应用，按 `components/`、`lib/`、`registry/` 分组。

## 文件职责

| 文件 | 职责 |
|---|---|
| `main.tsx` | **入口**。`initTheme()`（首屏前应用持久化主题，避免闪烁）→ `createRoot(#root).render(<App/>)`，包 `StrictMode`，引入 `index.css`。 |
| `components/App.tsx` | **顶层容器**。状态：进程列表 `data`、选中进程 `selected`、日志栏折叠 `logCollapsed`、toast、auto-refresh(3s)。布局：header（标题/New/Refresh/主题/auto）+ 左右分栏（ProcessList / LogPanel）+ 折叠 rail + Toast。`refresh()` 同步选中态。 |
| `components/ProcessList.tsx` | 进程表格（coss `Table`）：Name/Command/Status/PID/Exit/Actions(Logs/Restart/Stop)。stop 前 `window.confirm`；调 `restartProcess`/`stopProcess`。 |
| `components/LogPanel.tsx` | **内联右栏日志**。stdout/stderr 切换、count 输入、`ScrollArea` + `<pre>` 展示。`useEffect` 在 process/stream/count 变化时重取，用 `reqId` ref 防竞态（丢弃过期响应）。 |
| `components/NewProcessDialog.tsx` | **新建进程弹窗**（coss `Dialog`）。表单：name/script/args/cwd/envs；`parseEnvs` 解析多行 `KEY=VALUE`。遵守 form-in-dialog 不变量。描述文案提示「绕过 allow-x」。 |
| `components/StatusBadge.tsx` | 按 `ProcessStatus` 映射 coss `Badge` variant（running→success, spawning→warning, exited→secondary, error→error）。 |
| `components/Toast.tsx` | 内联瞬时 toast（非 coss 原语），2.8s 自动消失，`role="status"`。 |
| `lib/api.ts` | **REST 客户端**。`api<T>()` 同源 fetch 封装，非 2xx 抛带 `error` 消息。导出 `listProcesses`/`getProcess`/`getLogs`/`startProcess`/`stopProcess`/`restartProcess`/`parseEnvs`。 |
| `lib/types.ts` | 镜像后端的 `ProcessStatus`/`ProcessView`/`ProcessListResponse`/`LogsResponse`/`StartProcessBody`。 |
| `lib/useTheme.ts` | 主题 hook：`readStoredTheme`（localStorage `procm-theme`，缺省 dark）、`initTheme`（同步应用，避免 FOUC）、`useTheme()`（state + 持久化 + toggle）。 |
| `index.css` | Tailwind v4 入口 + 自定义主题 token（显式 hex/rgb，`:root` 亮 / `.dark` 暗）+ base 层。 |
| `registry/default/lib/utils.ts` | `cn()` = `twMerge(clsx(...))`，coss 组件依赖。 |
| `registry/default/ui/*.tsx` | **vendored coss 组件**：badge/button/card/dialog/field/input/scroll-area/separator/spinner/table/textarea。来源 coss registry，按需拷贝。 |

## 子域划分

- **应用层**：`main.tsx`、`components/*.tsx`。
- **数据层**：`lib/api.ts`、`lib/types.ts`。
- **主题**：`lib/useTheme.ts`、`index.css`。
- **UI 原语（vendored）**：`registry/default/ui/*` + `registry/default/lib/utils.ts`。

## 数据流

```
App (state: data, selected)
 │  refresh() ──► lib/api listProcesses() ──► GET /api/processes
 │
 ├─► ProcessList  ──► restartProcess/stopProcess ──► POST /api/.../{restart,stop}
 │      └ onSelectLogs(p) ──► setSelected(p)
 │
 └─► LogPanel(selected) ──► getLogs(id,stream,count) ──► GET /api/processes/:id/logs
NewProcessDialog ──► startProcess(body) ──► POST /api/processes
```
