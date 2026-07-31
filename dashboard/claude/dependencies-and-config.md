# dashboard 依赖与配置

## 依赖（`dashboard/package.json`）

| 依赖 | 版本 | 用途 |
|---|---|---|
| `react` / `react-dom` | ^19.0.0 | UI 框架 |
| `@base-ui/react` | ^1.0.0-alpha.10 | coss 之下的原语层 |
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
| `typescript` | ^5.8.0 | 类型检查 |
| `@types/react` / `@types/react-dom` | ^19.0.0 | React 类型 |
| `@types/node` | ^24.0.0 | Node 类型 |

## 配置文件

| 文件 | 作用 |
|---|---|
| `package.json` | `"type": "module"`、scripts（dev/build/preview）。 |
| `tsconfig.json` | ES2022/ESNext、`moduleResolution: Bundler`、`jsx: react-jsx`、`strict` + `noUnusedLocals/Parameters` + `verbatimModuleSyntax`、`noEmit`、路径别名 `@/* → ./src/*`。 |
| `vite.config.ts` | `react()` + `tailwindcss()` 插件、`base: "./"`、`@ → ./src` alias、`outDir: dist`。**未配 dev proxy**。 |
| `index.html` | Vite 入口 HTML（`#root` + `/src/main.tsx`）。 |

## 环境变量

dashboard 自身不读环境变量。运行时行为由**后端**的环境决定（`PROCM_HTTP_PORT`、`PROCM_HTTP_TOKEN`、`PROCM_ALLOW_ALL`，见根 [claude/dependencies-and-config.md](../claude/dependencies-and-config.md)）。

> 注意：当后端启用 `PROCM_HTTP_TOKEN` 时，dashboard 的 fetch 不带 token，会 401（见 public-interfaces）。

## 版本差异注意

- **Tailwind v4**：用 `@import "tailwindcss"` + `@theme inline` + `@custom-variant dark`，不是 v3 的 `tailwind.config.js` + PostCSS。
- **React 19**：用 `react-dom/client` 的 `createRoot`；`StrictMode` 下 effect 在开发模式会双调（LogPanel 的 `reqId` 防竞态在此有意义）。
- **`@base-ui/react` 是 alpha**：API 可能变动，vendored 的 coss 组件锁定了用法。
