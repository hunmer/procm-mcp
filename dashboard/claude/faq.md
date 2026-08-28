# dashboard 常见问题（FAQ）

## Q1: dev 模式下 API / WS 连不上？
`vite.config.ts` **已配 proxy**：`/api`、`/mcp`、`/assets`、`/ws` 转发到 `PROCM_DEV_BACKEND`（默认 `http://127.0.0.1:7331`）。前提是后端在跑——先 `npm run start:server`，再 `npm run dev:dashboard`。若后端在别的端口，设 `PROCM_DEV_BACKEND=http://127.0.0.1:<port>`。

## Q2: 改了主题颜色没生效 / 整页背景偏色？
`src/index.css` 刻意**只用显式 hex/rgb**，不用 coss 官方的 `color-mix()`/`oklch()`/`--alpha()`（某些 Chromium 解析不一致会偏色）。改 token 时保持 hex/rgb，别引入函数式颜色记法。

## Q3: 新增 coss 组件报错找不到模块？
组件 vendored 在 `src/registry/default/ui/`，经 `@/registry/default/ui/<name>` 导入。新增时不仅要拷贝目标组件，还要拷贝它的传递依赖（如 `lib/utils`、`scroll-area`、`spinner`）。漏依赖会运行/类型报错。

## Q4: dialog 里表单提交按钮不触发？
检查 form-in-dialog 不变量：`DialogHeader` 必须在 `<form>` **外**，`<form className="contents">` 包裹 `DialogPanel` + `DialogFooter`。否则弹窗 flex 布局会把 form 当中间层，submit 按钮可能脱离 form。

## Q5: 后端开了 token 鉴权，dashboard 一直 401？
`lib/api.ts` **不自动注入** `Authorization` header；`lib/ws.ts` 只从页面 URL `?token=` 取 token。受 `PROCM_HTTP_TOKEN` 保护时，把 token 放进页面 URL 访问（如 `http://127.0.0.1:7331/?token=xxx`），WS 会带上；REST 仍需自行扩展注入（已知缺口）。

## Q6: 实时日志没追加 / 进程列表不更新？
检查 WS 状态（header 连接灯）：断线态会自动重连并显示回退倒计时。`lib/ws.ts` 的回调存 ref，App 用 `onProcessesMessage`/`onLogMessage` 注册——若在别处注册，确保走这两个函数而非直接改 socket。实时日志只在 `openLogIdRef` 匹配时转发给 LogPanel，否则只 +未读徽标。

## Q7: `ProcessView` 字段对不上后端？
后端 `toPublicRecord`/`toPublicView`（`src/http-server.ts`）改字段时，必须同步 `src/lib/types.ts`，否则类型/渲染出错。两处需手动保持一致。

## Q8: 构建报类型错误但代码能跑？
`npm run build` 先 `tsc -b`（strict + noUnusedLocals/Parameters），比运行时更严。按报错修：删未用变量/参数、补类型。`verbatimModuleSyntax` 要求类型 import 用 `import type`。

## Q9: 收藏（favorites）保存在哪？换浏览器还在吗？
收藏是**进程记录上的服务端字段**（`ProcessView.favorite`），随 WS 下发、经 `PATCH /api/processes/:id` 修改（`lib/api.ts` 的 `setProcessFavorite`）——换浏览器/清缓存不丢（只要后端进程记录还在）。旧的 localStorage 方案（`procm-favorites` / `lib/favorites.ts`）已删除。「保存启动配方」改用 SettingsDialog data Tab：导出下载 `procm-processes.json` / 导入上传 JSON 逐条 `POST /api/processes/import` 重建（不启动）；目录扫描导入走 ImportGroupDialog（`POST /api/favorites/scan` 候选 + `POST /api/processes/import-batch` 批量）。
