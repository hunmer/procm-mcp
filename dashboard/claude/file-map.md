# dashboard 文件地图

```
dashboard/
├── index.html                         # Vite 入口 HTML（#root + main.tsx）
├── package.json                       # type:module · dev/build/preview · deps
├── tsconfig.json                      # Bundler/react-jsx/strict/alias @
├── vite.config.ts                     # react()+tailwindcss() · base:"." · @ alias
├── README.md                          # 本工程说明
└── src/
    ├── main.tsx                       # ★ React 入口：initTheme + createRoot
    ├── index.css                      # ★ Tailwind v4 + 主题 token（显式 hex/rgb）
    ├── components/
    │   ├── App.tsx                    # ★ 顶层：状态 + 布局 + 轮询 + 分栏
    │   ├── ProcessList.tsx            # 进程表格 + Stop/Restart/Logs
    │   ├── LogPanel.tsx               # ★ 内联右栏日志（stream/count/防竞态）
    │   ├── NewProcessDialog.tsx       # ★ 新建进程弹窗（form-in-dialog）
    │   ├── StatusBadge.tsx            # status → Badge variant
    │   └── Toast.tsx                  # 内联瞬时 toast
    ├── lib/
    │   ├── api.ts                     # ★ REST 客户端（同源 /api）
    │   ├── types.ts                   # ★ 镜像后端 ProcessView 等
    │   └── useTheme.ts                # 主题 hook + localStorage
    └── registry/default/
        ├── lib/utils.ts               # cn() = twMerge(clsx)
        └── ui/                        # vendored coss 组件
            ├── badge.tsx
            ├── button.tsx
            ├── card.tsx
            ├── dialog.tsx
            ├── field.tsx
            ├── input.tsx
            ├── scroll-area.tsx
            ├── separator.tsx
            ├── spinner.tsx
            ├── table.tsx
            └── textarea.tsx
```

## 被忽略

- `node_modules/`、`dist/`、`tsconfig.tsbuildinfo` — 依赖/产物。
- `package-lock.json` — 锁文件。

## 定位速查

| 想找... | 去哪 |
|---|---|
| 整体布局/状态 | `src/components/App.tsx` |
| 某个 REST 调用 | `src/lib/api.ts` |
| 后端字段对应类型 | `src/lib/types.ts` |
| 日志展示逻辑 | `src/components/LogPanel.tsx` |
| 启动进程表单 | `src/components/NewProcessDialog.tsx` |
| 主题颜色 | `src/index.css`（`:root`/`.dark`） |
| coss 组件实现 | `src/registry/default/ui/<name>.tsx` |
