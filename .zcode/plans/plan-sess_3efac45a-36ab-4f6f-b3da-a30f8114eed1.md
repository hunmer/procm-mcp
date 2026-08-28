# 重启停止的进程 + 移除白名单功能

修复根因：停止的进程从内存数组 `processes[]` 移除（仅持久化记录保留），`restartProcess` 只查内存数组，故返回 `null` → 404。同时按准则移除白名单功能，并保证"所有启动的进程都有完整记录、可完整恢复"。

## 一、后端：支持从历史记录重启 + 持久化 envs

### 1. `src/processes-repository.ts` — 持久化 envs
- `ProcessRecord` 类型新增 `envs?: Record<string, string> | null`（可选，向后兼容旧记录）。注释说明：仅用于进程恢复，从不发送给客户端。

### 2. `src/process-manager.ts`
- `toRecord()`：写入 `envs: meta.envs`（在 stdout/stderrLogPath 附近）。
- `restartProcess(id)`：当 `findProcessIndex(id) === -1` 时，回退查询持久化记录 `getProcessRecord(id)`：
  - 找到记录 → 用记录里的 `script/args/cwd/envs/desc` 启动新进程，`envs` 用 `record.envs ?? {}`（兼容旧记录），`pushProcess(newProcess)` 推入数组（保持原 id）。
  - 记录也找不到 → 返回 `null`。
  - 内存命中（原有路径）逻辑不变，只是不再因内存未命中就立即返回 null。

### 3. `src/http-server.ts`
- restart 处理器（761-773）保持不变（仍由 `restartProcess` 返回值决定 404）。
- 删除 543 行"intentionally bypasses allow-x"注释（已无意义）。

## 二、前端：启用停止进程的运行按钮

### 4. `dashboard/src/components/ProcessList.tsx`
- 行内 Play 按钮（385-396）：移除 `disabled={isExpired}`，停止的进程也可点击 → 调用 `handleRestart`。
- 现在的判定逻辑：`canStop`（运行中）显示 Stop 按钮；其余（停止/exited/error）显示 Play 按钮，全部启用。
- 右键菜单（563-585）：新增 "重启" 项（非 `canStop` 时显示），调用 `handleRestart`。
- 更新 336-342 行关于 isExpired 的注释。

### 5. i18n（`en.json` / `zh.json`）
- 新增 `processes.ctxRestart`（重启 / Restart）。
- 重写 `dialogs.newProcess.description`（去掉"绕过 allow-x"表述）。

## 三、移除白名单（allow-x）功能

### 删除整个文件
- `src/allowed-process-creations.ts`
- `src/tools/allowed-process.ts`
- `tests/allow-x.mjs`

### 移除引用
- `src/tools/process.ts`：删 import（`isAllowAll` 第 16 行、`checkProcessCreationAllowed` 第 18 行）+ gate 块（47-61 行）。
- `src/tools/procm-commands.ts`：删 import（第 14、16 行）+ gate 块（136-149 行）+ 描述文字（第 75 行 allow-x 句）+ 注释（第 69 行）。
- `src/process-manager.ts`：删 `allowAll` flag + `setAllowAll`/`isAllowAll`（140-151 行）。
- `src/index.ts`：删 import（`setAllowAll` 第 7 行、`registerAllowedProcessTools` 第 12 行）、注册（第 126 行）、CLI parse（`allowAll` flag 第 27、37-38 行）、help 文本（23、42、50-52 行）、env-apply 块（62-80 行）、可选删 `envFlag`（63-66 行，仅此处用）。
- `src/mcp-http.ts`：删 import（第 14 行）+ `registerAllTools` 内调用（第 22 行）+ 第 6 行注释中"allow list"字样。

### 测试清理
- `tests/run-all.mjs`：删 `"allow-x.mjs"` 条目（第 14 行）。
- `tests/_helpers.mjs`：从 `startBackend`（34、36、40）和 `mcpCalls`（90、93、95）中剥离 `allowAll` 参数。
- `tests/mcp-http.mjs`：删"allow-x gate applies on MCP-HTTP path"测试块（70+ 行），保留 CORS preflight 测试。
- `tests/ws-livecheck.mjs`：从 spawn args（第 13 行）删 `"--allow-all"`。
- `package.json`：删 `test:allow-x` 脚本（第 32 行）。

## 四、验证
- `npm run build`（tsc 通过，无悬空 import）。
- `node ./tests/run-all.mjs`（除删掉的 allow-x 外全部通过）。
- 手动：通过 MCP 启动进程 → 停止 → curl `/api/processes/:id/restart` 应返回 200 而非 404；新进程带原 envs 运行。

## 不在本次范围
- 文档（README.md / claude/*.md / CLAUDE.md）中对 allow-x 的历史提及——本次不更新，保持代码聚焦。
- 残留的 `<tmpdir>/procm-mcp/allowed-process-creations.json`——不主动删除磁盘文件（用户可自行清理）。