# dashboard 依赖与配置

## 依赖（`dashboard/package.json`）

| 依赖 | 版本 | 用途 |
|---|---|---|
| `react` / `react-dom` | ^19.0.0 | UI 框架 |
| `@base-ui/react` | ^1.0.0-alpha.10 | coss 之下的原语层 |
| `@tanstack/react-table` | ^8.21.3 | ProcessList 表格 |
| `lucide-react` | ^1.28.0 | 图标 |
| `class-variance-authority` | ^0.7.1 | 组件 variant |
| `clsx` | ^2.1.1 | 类名拼接（`cn`） |
| `tailwind-merge` | ^3.6.0 | 合并 Tailwind 类（`cn`） |

## 开发依赖

| 依赖 | 版本 | 用途 |
|---|---|---|
| `vite` | ^6.0.0 | 构建/dev server |
| `@vitejs/plugin-react` | ^4.3.0 | React Fast Refresh |
| `tailwindcss` | ^4.0.0 | 样式（v4） |
| `@tailwindcss/vite` | ^4.0.0 | Tailwind v4 Vite 插件 |
| `react-dev-inspector` / `@react-dev-inspector/vite-plugin` / `-babel-plugin` | ^2.0.x | dev 模式点击元素开源码 |
| `typescript` | ^5.8.0 | 类型检查 |
| `@types/react` / `@types/react-dom` | ^19.0.0 | React 类型 |
| `@types/node` | ^24.0.0 | Node 类型 |

## 配置文件

| 文件 | 作用 |
|---|---|
| `package.json` | `"type": "module"`、scripts（dev/build/preview）。 |
| `tsconfig.json` | ES2022/ESNext、`moduleResolution: Bundler`、`jsx: react-jsx`、`strict` + `noUnusedLocals/Parameters` + `verbatimModuleSyntax`、`noEmit`、路径别名 `@/* → ./src/*`。 |
| `vite.config.ts` | `react()`(dev 注入 inspector babel plugin) + `tailwindcss()` + `inspectorServer()`、`base: "./"`、`@ → ./src` alias、`server.proxy`（`/api`、`/mcp`、`/assets`、`/ws`，目标 `PROCM_DEV_BACKEND`）、`outDir: dist`。 |
| `index.html` | Vite 入口 HTML（`#root` + `/src/main.tsx`）。 |

## 环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `PROCM_DEV_BACKEND` | dev 模式 proxy 转发目标（`/api`、`/mcp`、`/assets`、`/ws`） | `http://127.0.0.1:7331` |
| `REACT_EDITOR` | dev 模式 inspector 打开源码用的编辑器 | 编辑器自动探测 |

运行时行为由**后端**的环境决定（`PROCM_HTTP_PORT`、`PROCM_HTTP_TOKEN`、`PROCM_ALLOW_ALL`，见根 [claude/dependencies-and-config.md](../claude/dependencies-and-config.md)）。

## 版本差异注意

- **Tailwind v4**：用 `@import "tailwindcss"` + `@theme inline` + `@custom-variant dark`，不是 v3 的 `tailwind.config.js` + PostCSS。
- **React 19**：用 `react-dom/client` 的 `createRoot`；`StrictMode` 下 effect 在开发模式会双调（LogPanel 的 `reqId` 防竞态、WS 重连逻辑在此有意义）。
- **`@base-ui/react` 是 alpha**：API 可能变动，vendored 的 coss 组件锁定了用法。
