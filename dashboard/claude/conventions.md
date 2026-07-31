# dashboard 开发约定

## 命令

```bash
# 从项目根
npm run build:dashboard   # 构建本工程 -> dashboard/dist
npm run dev:dashboard     # vite dev（HMR），需连一个运行中的后端
npm run build:all         # dashboard + 后端一次全建

# 在 dashboard/ 内
npm install
npm run dev               # dev server http://localhost:5173
npm run build             # tsc -b && vite build -> dist/
npm run preview           # 预览生产构建
```

> `npm run build` 先 `tsc -b`（类型检查，`noEmit`）再 `vite build`。类型错误会阻断构建。

## 跨域开发

dev server 在 5173，后端在 7331（或其他端口）。API 调用是同源相对路径 `/api/...`，所以：
- 要么在 `vite.config.ts` 配 proxy 把 `/api` 转发到后端；
- 要么直接 `npm run build:dashboard` 让后端托管 `dist`（无跨域问题）。
> 当前 `vite.config.ts` **未配 proxy**，所以纯 dev 模式下 API 会打到 5173 自身而失败——推荐用 build 后由后端托管的方式开发。

## 代码风格（从现有代码归纳）

- TypeScript **strict** + `noUnusedLocals` + `noUnusedParameters` + `verbatimModuleSyntax`。
- `tsconfig.json`：`moduleResolution: Bundler`、`jsx: react-jsx`、路径别名 `@/* → ./src/*`（与 vite 的 `resolve.alias` 对齐）。
- 组件用函数声明 + props interface；状态多用 hooks（`useState`/`useEffect`/`useRef`/`useCallback`）。
- API 调用集中在 `src/lib/api.ts`，组件不直接 `fetch`。
- Tailwind v4：样式用工具类；设计 token 在 `src/index.css` 的 `@theme inline` + `:root`/`.dark`。

## coss 组件约定（重要）

- 组件 vendored 自 [coss registry](https://github.com/cosscom/coss)（`apps/ui/registry/default/ui/*.tsx`），放在 `src/registry/default/ui/`。
- 通过 `@/registry/default/ui/<name>` 别名导入。
- **新增组件**：从 registry 拷贝源码 + 其传递依赖（如 `lib/utils`、`scroll-area`、`spinner`），放到相同路径。
- **form-in-dialog 不变量**（见 `NewProcessDialog`）：`DialogHeader` 在 form **外**；`<form className="contents">` 包裹 `DialogPanel` + `DialogFooter`，使弹窗的 flex 列布局仍把它们当直接子节点。
- 用 coss 原语时遵循 `render` prop / 组合式 API（如 `DialogTrigger render={<Button/>}`）。

参考根目录 `.agents/skills/coss/`（coss skill）与 `coss-particles`（组件示例索引）获取规范。

## 注意事项

- 主题 token **必须用显式 hex/rgb**，不要引入 `color-mix()`/`oklch()`/`--alpha()`（见 overview）。
- `ProcessView` 类型要与后端 `toPublicView` 保持同步；后端字段变动时记得改 `src/lib/types.ts`。
- dashboard 无自动化测试，改动后务必人工验证构建与交互。
