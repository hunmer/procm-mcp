# procm-mcp dashboard

procm-mcp 的 Web 管理界面，由后端在 `GET /` 静态托管（构建产物 `dist/` 打包进 npm 包）。独立的 React + Vite 工程，经同源 **WebSocket `/ws`**（实时进程/日志推送，自动重连）+ REST `/api/*`（操作与历史）与后端通信。进程列表支持表格/卡片双视图、过滤、分页、排序、右键菜单与批量操作；System Tab 查看/终止 OS 级进程；日志面板带 ANSI 终端渲染与结构化 JSON 展开（经 `@procm-mcp/sdk` 解码）；收藏夹（纯 localStorage 启动配方，支持文件夹导入）；en/zh 双语；默认暗色，支持亮/暗切换，选中状态可经 URL 还原。

技术栈：**React 19** + **Vite 6** + **Tailwind CSS v4** + **coss**（基于 `@base-ui/react`）+ `@tanstack/react-table` + `react-i18next` + `lucide-react`。

## 约定（高优先级）

- 改完跑 `npm run build`（在 `dashboard/`）或项目根 `npm run build:dashboard`——`tsc -b` 类型检查 + `vite build`。注意根 `build` = `build:dashboard && tsc`，**没有** `build:all`。
- **主题 token 必须用显式 hex/rgb**，不要用 `color-mix()`/`oklch()`/`--alpha()`（`src/index.css` 刻意如此，避免 Chromium 偏色）。
- coss 组件 vendored 在 `src/registry/default/ui/`，经 `@/registry/default/ui/<name>` 导入；新增需连传递依赖一起拷贝。
- **form-in-dialog 不变量**：`DialogHeader` 在 form 外，`<form className="contents">` 包 `DialogPanel`+`DialogFooter`。
- 后端 `ProcessView` 字段变动时，同步改 `src/lib/types.ts`。
- 实时数据：WS 回调用 `onProcessesMessage`/`onLogMessage` 注册（内部存 ref，不重订阅）；收藏是纯前端 localStorage（`lib/favorites.ts`）。
- 新 UI 文案要同时补 `locales/en.json` 与 `locales/zh.json`（`useTranslation` 取键）。
- dev 模式：`vite.config.ts` **已配 proxy**（`/api`、`/mcp`、`/assets`、`/ws` → `PROCM_DEV_BACKEND`），先 `npm run start:server` 再 `npm run dev:dashboard`。

详见 [claude/conventions.md](claude/conventions.md)。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [claude/overview.md](claude/overview.md) | 技术栈、与后端契约、布局/主题取舍 | 第一次理解 dashboard 时 |
| [claude/conventions.md](claude/conventions.md) | 命令、风格、coss 约定、注意事项 | 改代码前 |
| [claude/module-responsibilities.md](claude/module-responsibilities.md) | 各组件/lib 文件职责与数据流 | 定位实现时 |
| [claude/entrypoints.md](claude/entrypoints.md) | 入口、浏览器/构建流程、托管解析 | 理解启动时 |
| [claude/public-interfaces.md](claude/public-interfaces.md) | dashboard 调用的 REST 与类型契约 | 对接后端时 |
| [claude/dependencies-and-config.md](claude/dependencies-and-config.md) | 依赖、配置、版本差异 | 排查环境时 |
| [claude/data-model.md](claude/data-model.md) | 前端状态、镜像类型、主题持久化 | 改状态/类型时 |
| [claude/testing-and-quality.md](claude/testing-and-quality.md) | （当前零测试）类型门禁、质量风险 | 评估质量时 |
| [claude/file-map.md](claude/file-map.md) | 目录树 + 定位速查 | 找文件时 |
| [claude/faq.md](claude/faq.md) | 常见问题与定位路径 | 踩坑时 |
| [claude/changelog.md](claude/changelog.md) | 本索引的生成/更新记录 | 查文档版本时 |

## 扫描状态

- **更新时间**：2026-08-15
- **已扫描**：`src/main.tsx`、`src/i18n.ts`、`src/components/*.tsx`（12 个，8-15 新增的 `SystemProcessList`/`TerminalLog`/`JsonViewer`/`ansi` 按头部+导出抽查）、`components/process-list/`（13 文件，结构级）、`src/lib/*.ts`（9 个）、`index.html`、`package.json`、`tsconfig.json`、`vite.config.ts`。
- **未详读**：`src/registry/default/ui/*.tsx`（26 个 vendored coss 组件，已归纳用法）；`node_modules/`、`dist/`、`tsconfig.tsbuildinfo`、`src/index.css`（已归纳主题 token 策略）。
- **缺口**：零自动化测试；REST 客户端未支持 token 注入（受保护后端 dashboard 的 REST 会 401）；`process-list/` 与 `SystemProcessList` 本轮仅结构级扫描。详见 [claude/changelog.md](claude/changelog.md)。
