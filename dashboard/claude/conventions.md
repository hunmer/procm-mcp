# dashboard 开发约定

## 命令

```bash
# 从项目根
npm run build:dashboard   # 构建本工程 -> dashboard/dist
npm run dev:dashboard     # vite dev（HMR），proxy 转发 /api、/mcp、/assets、/ws 到后端
npm run build             # （根）先 build:dashboard 再 tsc，一次性全建

# 在 dashboard/ 内
npm install
npm run dev               # dev server http://localhost:5173
npm run build             # tsc -b && vite build -> dist/
npm run preview           # 预览生产构建
```

> 注意：根 `package.json` **没有**独立的 `build:all` 脚本；根 `build` = `npm run build:dashboard && tsc`。`npm run build`（在 dashboard/）先 `tsc -b`（类型检查，`noEmit`）再 `vite build`。类型错误会阻断构建。

## 跨域开发（已配 proxy）

dev server 在 5173，后端在 7331（或其他）。`vite.config.ts` **已配 proxy**：`/api`、`/mcp`、`/assets` 转发到 `PROCM_DEV_BACKEND`（默认 `http://127.0.0.1:7331`），`/ws` 走 WebSocket proxy。所以 dev 模式下 SPA 用同源相对 URL 即可直连后端——**先 `npm run start:server` 起后端，再 `npm run dev:dashboard`**。生产环境由后端自身托管一切，proxy 不参与。

## 代码风格（从现有代码归纳）

- TypeScript **strict** + `noUnusedLocals` + `noUnusedParameters` + `verbatimModuleSyntax`。
- `tsconfig.json`：`moduleResolution: Bundler`、`jsx: react-jsx`、路径别名 `@/* → ./src/*`（与 vite 的 `resolve.alias` 对齐）。
- 组件用函数声明 + props interface；状态多用 hooks（`useState`/`useEffect`/`useRef`/`useCallback`/`useMemo`）。
- API 调用集中在 `src/lib/api.ts`，组件不直接 `fetch`；WS 逻辑集中在 `src/lib/ws.ts`。
- 实时数据回调用 ref 持有（`processesRef`/`logRef`），避免内联回调触发 socket 重订阅（见 `ws.ts`）。
- Tailwind v4：样式用工具类；设计 token 在 `src/index.css` 的 `@theme inline` + `:root`/`.dark`。

## coss 组件约定（重要）

- 组件 vendored 自 [coss registry](https://github.com/cosscom/coss)，放在 `src/registry/default/ui/`。
- 通过 `@/registry/default/ui/<name>` 别名导入。
- **新增组件**：从 registry 拷贝源码 + 其传递依赖（如 `lib/utils`、`scroll-area`、`spinner`），放到相同路径。
- **form-in-dialog 不变量**（见 `NewProcessDialog`）：`DialogHeader` 在 form **外**；`<form className="contents">` 包裹 `DialogPanel` + `DialogFooter`，使弹窗的 flex 列布局仍把它们当直接子节点。
- 用 coss 原语时遵循 `render` prop / 组合式 API（如 `DialogTrigger render={<Button/>}`）。

参考根目录 `.agents/skills/coss/`（coss skill）与 `coss-particles`（组件示例索引）获取规范。

## 注意事项

- 主题 token **必须用显式 hex/rgb**，不要引入 `color-mix()`/`oklch()`/`--alpha()`（见 overview）。
- `ProcessView` 类型要与后端 `toPublicRecord` 保持同步；后端字段变动时记得改 `src/lib/types.ts`。
- 收藏（favorites）是纯前端 localStorage 概念，后端不存——改动收藏逻辑只在 `lib/favorites.ts`。
- dashboard 无自动化测试，改动后务必人工验证构建与交互。
