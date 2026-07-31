# dashboard 常见问题（FAQ）

## Q1: dev 模式下 API 全 404 / 失败？
dev server（5173）与后端（如 7331）不同源，而 `lib/api.ts` 用同源相对路径 `/api/...`。当前 `vite.config.ts` **未配 proxy**。解决：在 `vite.config.ts` 加 `server.proxy['/api']`，或直接 `npm run build:dashboard` 让后端托管 `dist`。

## Q2: 改了主题颜色没生效 / 整页背景偏色？
`src/index.css` 刻意**只用显式 hex/rgb**，不用 coss 官方的 `color-mix()`/`oklch()`/`--alpha()`（某些 Chromium 解析不一致会偏色）。改 token 时保持 hex/rgb，别引入函数式颜色记法。

## Q3: 新增 coss 组件报错找不到模块？
组件 vendored 在 `src/registry/default/ui/`，经 `@/registry/default/ui/<name>` 导入。新增时不仅要拷贝目标组件，还要拷贝它的传递依赖（如 `lib/utils`、`scroll-area`、`spinner`）。漏依赖会运行/类型报错。

## Q4: dialog 里表单提交按钮不触发？
检查 form-in-dialog 不变量：`DialogHeader` 必须在 `<form>` **外**，`<form className="contents">` 包裹 `DialogPanel` + `DialogFooter`。否则弹窗 flex 布局会把 form 当中间层，submit 按钮可能脱离 form。

## Q5: 后端开了 token 鉴权，dashboard 一直 401？
`lib/api.ts` 当前**不自动注入** `Authorization` header。受 `PROCM_HTTP_TOKEN` 保护的后端上 dashboard 会失败。需要扩展 `api()` 从某处取 token 注入（已知缺口）。

## Q6: 日志切换太快显示串了？
LogPanel 用 `reqId` ref 丢弃过期响应防竞态。若仍异常，检查 `useEffect` 依赖是否完整（`[process.id, stream, count]`），以及 cleanup 是否设了 `cancelled`。

## Q7: `ProcessView` 字段对不上后端？
后端 `toPublicView`（`src/http-server.ts`）改字段时，必须同步 `src/lib/types.ts`，否则类型/渲染出错。两处需手动保持一致。

## Q8: 构建报类型错误但代码能跑？
`npm run build` 先 `tsc -b`（strict + noUnusedLocals/Parameters），比运行时更严。按报错修：删未用变量/参数、补类型。`verbatimModuleSyntax` 要求类型 import 用 `import type`。
