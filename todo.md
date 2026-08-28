# TODO

## 待办(按优先级)

### 1. 修复被管理进程 env 合并顺序(高)
- `src/process-manager.ts` 的 `startProcess` 组装 env 为 `{ ...process.env, ...envs, ...roomEnv }`,`roomEnv`(`getConnectionEnv()` 注入的 `PROCM_WS_URL=ws://127.0.0.1:7331/room`)排在最后,覆盖了 procm-commands.json 显式设置的 envs。
- 后果:demo 一直连到全局 7331 而非当前项目 7332;目前 demo 用专用变量 `PROCM_DEMO_WS_URL` 绕过(显式传入 SDK `options.url`)。
- 修复:改为显式 `envs` 优先(如 `{ ...process.env, ...roomEnv, ...envs }`)。
- 注意:需 `npm run build` 后更新全局安装的实例并重启全局 procm-mcp,会中断 Agent 会话的 MCP 工具,单独安排。

### 2. Windows 上无法 spawn npm(高)
- `startProcess` 直接 `spawn(script)`,Windows 上 `npm` 是 `npm.cmd`,无 `shell: true` 时 `spawn npm ENOENT`;`pnpm` 有 `pnpm.exe` 可用。
- 目前 procm-commands.json 用 pnpm 绕过。
- 修复:win32 下解析 `.cmd`/`.bat`(自动补后缀或 shell 包装),使配置可跨平台使用 npm;同样需要更新全局实例。

### 3. demo 日志缓冲不持久化(低)
- node-server 页面的日志面板来自内存缓冲(上限 500 条),进程重启后清空。
- 如需保留,可将缓冲落盘并在启动时回放。

### 4. SDK getTrace 仅支持按精确 ID 读取(低)
- 如需列表/按 roomId 过滤,需后端 `trace-get` 工具增加参数,再扩展 SDK。

### 5. demo 两端样式为两份拷贝(低)
- node-server 内联 style 与 electron `styles.css` 内容一致,再演进时可抽成共享 CSS。

### 6. demo 可增加 property hook 演示按钮(低)
- 当前只演示函数 Hook;`hookProperty` 与 before `skip`/after `setResult` 能力可各加一个测试按钮。
