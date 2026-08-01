# dashboard 文件地图

```
dashboard/
├── index.html                         # Vite 入口 HTML（#root + main.tsx）
├── package.json                       # type:module · dev/build/preview · deps
├── tsconfig.json                      # Bundler/react-jsx/strict/alias @
├── vite.config.ts                     # react()+tailwindcss()+inspectorServer() · base:"." · proxy · @ alias
├── README.md                          # 本工程说明
└── src/
    ├── main.tsx                       # ★ React 入口：initTheme + createRoot
    ├── index.css                      # ★ Tailwind v4 + 主题 token（显式 hex/rgb）
    ├── components/
    │   ├── App.tsx                    # ★ 顶层：状态 + WS 接线 + 双 Tab + 分栏 + 弹窗编排
    │   ├── ProcessList.tsx            # ★ 进程表格（@tanstack/react-table）+ 右键菜单 + 未读/收藏
    │   ├── LogPanel.tsx               # ★ 内联右栏日志（REST 历史 + WS 实时 + grep + 下载/复制）
    │   ├── NewProcessDialog.tsx       # ★ 新建/详情/收藏编辑弹窗（form-in-dialog + presets）
    │   ├── ImportFavoritesDialog.tsx  # 文件夹导入弹窗（扫描项目清单 → 勾选 → 入收藏）
    │   ├── FavoritesView.tsx          # Favorites Tab：收藏网格（分组/launch/edit/remove/open-folder）
    │   ├── StatusBadge.tsx            # status → Badge variant
    │   ├── Toast.tsx                  # 内联瞬时 toast
    │   └── DevInspector.tsx           # dev-only 元素检查器（生产渲染空）
    ├── lib/
    │   ├── api.ts                     # ★ REST 客户端（同源 /api）
    │   ├── ws.ts                      # ★ WebSocket hook（自动重连 + 回调 ref）
    │   ├── types.ts                   # ★ 镜像后端 ProcessView/Ws* 等
    │   ├── favorites.ts               # ★ Favorites 模型 + localStorage 存储 + useFavorites hook
    │   ├── presets.ts                 # 启动预设 hook（demo 脚本 + ${cwd} 解析）
    │   ├── cwd.ts                     # detectCwd（GET /api/meta）供 presets
    │   └── useTheme.ts                # 主题 hook + localStorage
    └── registry/default/
        ├── lib/utils.ts               # cn() = twMerge(clsx)
        └── ui/                        # vendored coss 组件（alert/alert-dialog/badge/button/card/
                                       #   checkbox/checkbox-group/context-menu/dialog/empty/field/
                                       #   input/label/menu/pagination/preview-card/scroll-area/
                                       #   select/separator/spinner/table/textarea 等）
```

## 被忽略

- `node_modules/`、`dist/`、`tsconfig.tsbuildinfo` — 依赖/产物。
- `package-lock.json` — 锁文件。

## 定位速查

| 想找... | 去哪 |
|---|---|
| 整体布局/状态/WS 接线 | `src/components/App.tsx` |
| WebSocket 连接/重连逻辑 | `src/lib/ws.ts` |
| 某个 REST 调用 | `src/lib/api.ts` |
| 后端字段对应类型 | `src/lib/types.ts` |
| 日志展示/实时追加逻辑 | `src/components/LogPanel.tsx` |
| 启动进程表单/presets | `src/components/NewProcessDialog.tsx` + `src/lib/presets.ts` |
| 收藏 CRUD/存储 | `src/lib/favorites.ts` |
| 收藏网格/分组/导入 | `src/components/FavoritesView.tsx` + `ImportFavoritesDialog.tsx` |
| 主题颜色 | `src/index.css`（`:root`/`.dark`） |
| coss 组件实现 | `src/registry/default/ui/<name>.tsx` |
