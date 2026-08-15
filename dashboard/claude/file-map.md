# dashboard 文件地图

```
dashboard/
├── index.html                         # Vite 入口 HTML（#root + main.tsx）
├── package.json                       # type:module · dev/build/preview · deps（react-i18next 等）
├── tsconfig.json                      # Bundler/react-jsx/strict/alias @
├── vite.config.ts                     # react()+tailwindcss()+inspectorServer() · base:"." · proxy · @ alias
├── README.md                          # 本工程说明
└── src/
    ├── main.tsx                       # ★ React 入口：initTheme + createRoot
    ├── i18n.ts                        # ★ i18next 初始化（en/zh）
    ├── index.css                      # ★ Tailwind v4 + 主题 token（显式 hex/rgb）
    ├── locales/
    │   ├── en.json                    # 英文文案
    │   └── zh.json                    # 简体中文文案
    ├── components/
    │   ├── App.tsx                    # ★ 顶层：状态 + WS 接线 + 多 Tab + 分栏 + 弹窗编排
    │   ├── ProcessList.tsx            # ★ 进程列表外壳（拼装 process-list/ 子域）
    │   ├── process-list/              # ★ 进程列表子域（13 文件）
    │   │   ├── useProcessActions.ts   #   操作 mutation（单个/批量）
    │   │   ├── useProcessColumns.tsx  #   react-table 列定义
    │   │   ├── ProcessTableView.tsx   #   表格视图
    │   │   ├── ProcessCardsView.tsx   #   卡片视图（ProcessCardBody）
    │   │   ├── ProcessFilterBar.tsx   #   搜索/状态过滤
    │   │   ├── ProcessPagination.tsx  #   分页
    │   │   ├── SortableHeader.tsx     #   排序表头
    │   │   ├── ProcessContextMenu.tsx #   行右键菜单
    │   │   ├── ProcessActions.tsx     #   操作按钮组
    │   │   ├── ProcessDialogs.tsx     #   详情等弹窗
    │   │   ├── types.ts               #   视图局部类型
    │   │   └── utils.ts               #   视图模式持久化（loadViewMode 等）
    │   ├── SystemProcessList.tsx      # ★ System Tab：OS 进程列表 + kill
    │   ├── LogPanel.tsx               # ★ 内联右栏日志（REST 历史 + WS 实时 + grep + 下载/复制）
    │   ├── TerminalLog.tsx            # ★ 终端日志渲染（ANSI + JSON data 展开 + 高亮）
    │   ├── ansi.ts                    # ANSI SGR 解析器（16 色调色板）
    │   ├── JsonViewer.tsx             # 交互式 JSON 树（coss Popover/Dialog）
    │   ├── NewProcessDialog.tsx       # ★ 新建/详情/收藏编辑弹窗（form-in-dialog + presets）
    │   ├── ImportFavoritesDialog.tsx  # 文件夹导入弹窗（扫描项目清单 → 勾选 → 入收藏）
    │   ├── FavoritesView.tsx          # Favorites Tab：收藏网格（分组/launch/edit/remove/open-folder）
    │   ├── StatusBadge.tsx            # status → Badge variant
    │   ├── Toast.tsx                  # 内联瞬时 toast
    │   └── DevInspector.tsx           # dev-only 元素检查器（生产渲染空）
    ├── lib/
    │   ├── api.ts                     # ★ REST 客户端（同源 /api；用 SDK 解析结构化日志）
    │   ├── ws.ts                      # ★ WebSocket hook（自动重连 + 回调 ref）
    │   ├── types.ts                   # ★ 镜像后端 ProcessView/Ws* 等
    │   ├── urlState.ts                # URL 状态同步（?proc= &collapsed=）
    │   ├── favorites.ts               # ★ Favorites 模型 + localStorage 存储 + useFavorites hook
    │   ├── presets.ts                 # 启动预设 hook（demo 脚本 + ${cwd} 解析）
    │   ├── cwd.ts                     # detectCwd（GET /api/meta）供 presets
    │   ├── useTheme.ts                # 主题 hook + localStorage
    │   └── useLanguage.ts             # 语言 hook + localStorage（procm-language）
    └── registry/default/
        ├── lib/utils.ts               # cn() = twMerge(clsx)
        └── ui/                        # vendored coss 组件（26 个：alert/alert-dialog/badge/button/
                                       #   card/checkbox/checkbox-group/context-menu/dialog/empty/field/
                                       #   input/label/menu/pagination/popover/preview-card/scroll-area/
                                       #   select/separator/slider/spinner/switch/table/tabs/textarea 等）
```

## 被忽略

- `node_modules/`、`dist/`、`tsconfig.tsbuildinfo` — 依赖/产物。
- `package-lock.json` — 锁文件。

## 定位速查

| 想找... | 去哪 |
|---|---|
| 整体布局/状态/WS 接线 | `src/components/App.tsx` |
| 进程列表列/视图/批量操作 | `src/components/process-list/` |
| 系统进程 Tab/kill | `src/components/SystemProcessList.tsx` |
| WebSocket 连接/重连逻辑 | `src/lib/ws.ts` |
| 某个 REST 调用 | `src/lib/api.ts` |
| 后端字段对应类型 | `src/lib/types.ts` |
| 日志展示/ANSI/实时追加 | `LogPanel.tsx` + `TerminalLog.tsx` + `ansi.ts` |
| 结构化日志 data 展开 | `JsonViewer.tsx`（经 `@procm-mcp/sdk` decode） |
| 启动进程表单/presets | `NewProcessDialog.tsx` + `lib/presets.ts` |
| 收藏 CRUD/存储 | `lib/favorites.ts` |
| 收藏网格/分组/导入 | `FavoritesView.tsx` + `ImportFavoritesDialog.tsx` |
| URL 选中/折叠状态 | `lib/urlState.ts` |
| 语言/文案 | `i18n.ts` + `locales/{en,zh}.json` + `lib/useLanguage.ts` |
| 主题颜色 | `src/index.css`（`:root`/`.dark`） |
| coss 组件实现 | `src/registry/default/ui/<name>.tsx` |
