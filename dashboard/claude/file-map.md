# dashboard 文件地图

```
dashboard/
├── index.html                         # Vite 入口 HTML（#root + main.tsx）
├── package.json                       # procm-mcp-dashboard · type:module · dev/build/preview · deps（i18next/zod/sdk 等）
├── tsconfig.json                      # Bundler/react-jsx/strict/alias @
├── vite.config.ts                     # react()+tailwindcss()+inspectorServer() · base:"." · proxy · @ alias
├── README.md                          # 本工程说明
└── src/
    ├── main.tsx                       # ★ React 入口：initTheme + createRoot
    ├── i18n.ts                        # ★ i18next 初始化（en/zh）
    ├── index.css                      # ★ Tailwind v4 + 主题 token（显式 hex/rgb）
    ├── locales/
    │   ├── en.json                    # 英文文案（16 个顶层域）
    │   └── zh.json                    # 简体中文文案（与 en 对称）
    ├── components/
    │   ├── App.tsx                    # ★ 顶层：四 Tab（processes/system/history/playground）+ WS 接线 + 顶栏 + 弹窗编排
    │   ├── ProcessList.tsx            # ★ 进程列表外壳：按 group 分组/折叠/置顶/组头操作（拼装 process-list/ 子域）
    │   ├── process-list/              # ★ 进程列表子域（11 文件）
    │   │   ├── useProcessActions.ts   #   操作 mutation（单个/批量）
    │   │   ├── ProcessFilterBar.tsx   #   status/sort/name 过滤 + CreateDropdown（无 group 过滤器）
    │   │   ├── ProcessCard.tsx        #   进程卡片
    │   │   ├── ProcessCardBody.tsx    #   卡片内容
    │   │   ├── ProcessActions.tsx     #   操作按钮组
    │   │   ├── ProcessContextMenu.tsx #   行右键菜单
    │   │   ├── ProcessDialogs.tsx     #   详情等弹窗
    │   │   ├── ProcessLogFilesDialog.tsx # 单进程落盘日志弹窗（内嵌 LogFilesView）
    │   │   ├── RenameGroupDialog.tsx  #   组重命名（updateProcess(id,{group}) 批量搬移）
    │   │   ├── types.ts               #   视图局部类型
    │   │   └── utils.ts               #   canStopProcess 等局部工具
    │   ├── SystemProcessList.tsx      # ★ System Tab 组合层：状态/轮询/过滤/kill
    │   ├── system-process/            # ★ System Tab 子域（11 文件）
    │   │   ├── SystemProcessTableView.tsx # @tanstack/react-table 表格视图
    │   │   ├── useSystemProcessColumns.tsx # 列定义/kill 确认
    │   │   ├── SortableHeader.tsx     #   排序表头
    │   │   ├── SystemProcessFilterBar.tsx # name/path/cmd 搜索 + ports only + 自动刷新 1/2/3/5s
    │   │   ├── SystemProcessBadges.tsx # ×N 合并徽章 + 端口徽章
    │   │   ├── SystemProcessContextMenu.tsx # 查看信息/打开位置/Kill
    │   │   ├── SystemProcessDialogs.tsx # 弹窗
    │   │   ├── SystemProcessInfo.tsx  #   只读信息体（dialog/panel 复用）
    │   │   ├── SystemProcessInfoPanel.tsx # 右侧信息面板
    │   │   ├── types.ts               #   ProcessRow（同名同父合并展示）+ 偏好 key
    │   │   └── utils.ts               #   localStorage 小工具
    │   ├── LogPanel.tsx               # ★ 内联右栏日志编排者（拼装 log-panel/ 子域）
    │   ├── log-panel/                 # ★ 日志面板子域（9 文件）
    │   │   ├── LogPanelHeader.tsx     #   进程名/ID、状态徽章、重启/停止、搜索、复制、关闭
    │   │   ├── LogPanelBody.tsx       #   日志渲染 + 空/错/已关态
    │   │   ├── LogPanelFooter.tsx     #   复制/下载/清空日志/打开日志文件/文件夹
    │   │   ├── LogPanelCommandStrip.tsx # 启动命令只读条
    │   │   ├── LogPanelStdinBar.tsx   #   stdin 输入 + 信号菜单
    │   │   ├── LogPanelStopDialog.tsx #   停止确认
    │   │   ├── LogPanelViewSettings.tsx # 字号/level 过滤/JSON 树开关 popover
    │   │   ├── constants.ts           #   HISTORY_COUNT/GREP_COUNT · showJson 持久化
    │   │   └── types.ts               #   FontSize/LevelFilter
    │   ├── LogFilesView.tsx           # ★ History Tab：落盘日志文件浏览（/api/log-files*）
    │   ├── playground/                # ★ Playground Tab（2 文件）
    │   │   ├── Playground.tsx         #   端点目录 + zod 校验表单 + JsonViewer 响应 + 复制 curl
    │   │   └── catalog.ts             #   端点目录（32 端点 6 组，镜像 http-server.ts 路由）
    │   ├── NewProcessDialog.tsx       # ★ 新建/详情弹窗（form-in-dialog + presets 快填）
    │   ├── SettingsDialog.tsx         # ★ 设置弹窗（general/data/logs 三 Tab）
    │   ├── ImportGroupDialog.tsx      # 目录导入弹窗（favorites/scan 候选 → import-batch）
    │   ├── CreateDropdown.tsx         # 「新建」下拉
    │   ├── TerminalLog.tsx            # ★ 终端日志渲染（ANSI + JSON data 展开 + 高亮）
    │   ├── ansi.ts                    # ANSI SGR 解析器（16 色调色板）
    │   ├── JsonViewer.tsx             # 交互式 JSON 树（coss Popover/Dialog）
    │   ├── StatusBadge.tsx            # status → Badge variant
    │   ├── Toast.tsx                  # 内联瞬时 toast
    │   └── DevInspector.tsx           # dev-only 元素检查器（生产渲染空）
    ├── lib/                           # 8 文件
    │   ├── api.ts                     # ★ REST 客户端（同源 /api；用 SDK 解析结构化日志；favorite/PATCH、import、server-log、log-files、select-directory 等）
    │   ├── ws.ts                      # ★ WebSocket hook（自动重连回退倒计时 + 回调 ref + logCleared）
    │   ├── types.ts                   # ★ 镜像后端 ProcessView（17 字段）/Ws*/ServerLogInfo/LogFileSummary
    │   ├── urlState.ts                # URL 状态同步（?proc= &collapsed=）
    │   ├── presets.ts                 # 启动预设（5 个 demo + ${cwd} 插值，只覆盖已定义字段）
    │   ├── cwd.ts                     # detectCwd（GET /api/meta）供 presets
    │   ├── useTheme.ts                # 主题 hook + localStorage（procm-theme，默认 dark）
    │   └── useLanguage.ts             # 语言 hook + localStorage（procm-language）
    └── registry/default/
        ├── lib/utils.ts               # cn() = twMerge(clsx)
        └── ui/                        # vendored coss 组件（按需拷贝 + 传递依赖）
```

## 被忽略

- `node_modules/`、`dist/`、`tsconfig.tsbuildinfo` — 依赖/产物。
- `package-lock.json` — 锁文件。

## 定位速查

| 想找... | 去哪 |
|---|---|
| 整体布局/状态/WS 接线 | `src/components/App.tsx` |
| 进程分组/折叠/置顶/组重命名 | `src/components/ProcessList.tsx` + `process-list/RenameGroupDialog.tsx` |
| 进程过滤/卡片/右键菜单 | `src/components/process-list/` |
| 系统进程 Tab/kill | `src/components/SystemProcessList.tsx` + `system-process/` 子域 |
| WebSocket 连接/重连逻辑 | `src/lib/ws.ts` |
| 某个 REST 调用 | `src/lib/api.ts` |
| 后端字段对应类型 | `src/lib/types.ts` |
| 日志面板（头部/底部/stdin/视图设置） | `LogPanel.tsx` + `log-panel/` 子域 |
| 日志展示/ANSI/实时追加 | `TerminalLog.tsx` + `ansi.ts` |
| 结构化日志 data 展开 | `JsonViewer.tsx`（经 `@hunmer/procm-mcp-sdk` decode） |
| 历史落盘日志浏览 | `LogFilesView.tsx` + `process-list/ProcessLogFilesDialog.tsx` |
| Playground/端点目录 | `playground/Playground.tsx` + `playground/catalog.ts` |
| 启动进程表单/presets | `NewProcessDialog.tsx` + `lib/presets.ts` |
| 设置（语言/主题/配方导入导出/server log） | `SettingsDialog.tsx` |
| 收藏开关 | `lib/api.ts` 的 `setProcessFavorite`（服务端字段，无 favorites 模块） |
| URL 选中/折叠状态 | `lib/urlState.ts` |
| 语言/文案 | `i18n.ts` + `locales/{en,zh}.json` + `lib/useLanguage.ts` |
| 主题颜色 | `src/index.css`（`:root`/`.dark`） |
| coss 组件实现 | `src/registry/default/ui/<name>.tsx` |
