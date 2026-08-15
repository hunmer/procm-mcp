# 开发约定

## 命令

```bash
npm run build          # 在 packages/procm-sdk/ 下：tsc -p tsconfig.json → dist/
npm run link:local     # 把 dist 链接到某个本地消费项目（scripts/link-sdk.mjs）
npm run publish:public # 发布 npm（scripts/publish-sdk.mjs）
```

根项目视角：`npm run build:sdk`（= `npm --prefix packages/procm-sdk run build`），根 `npm run build` 会**先**编 SDK 再编后端——后端 `src/` 直接 import `@procm-mcp/sdk`（protocol/解码函数），改 SDK 后必须重跑 `build:sdk` 才会被后端用到。

## 代码风格 / 约定

- ESM（`type: module`），源码 import **必须带 `.js` 后缀**（同根项目 Node16 解析），`verbatimModuleSyntax`。
- `dist/` 构建产物**提交进仓库**（后端与 dashboard 消费 workspace 依赖时直接用 dist）；改 `src/` 后记得重新 build，否则提交的 dist 与源码脱节。
- `engines: node >= 22`；浏览器兼容依赖全局 `WebSocket`/`crypto`/`TextEncoder`。
- 新导出一律从 `src/index.ts` 全量 re-export（当前 `export *` 各模块）。
- 随机 id 统一 `crypto.randomUUID()`，缺 crypto 时降级时间戳+随机串。

## 禁止事项 / 安全

- **不要在不受信环境启用 `custom-execution`**：接收端用 `eval` 求值请求里的函数源码，等于接受 room 内任意成员的远程代码执行。
- 不要在 stdio MCP 场景直接 console.log（消费方进程的 stdout 可能被日志采集 marker 污染时，必须走 `Logger` 的格式）。
- `before`/`after` hook 处理器必须同步——返回 Promise 会抛错（刻意的，保证 trace 语义确定）。
