## 修复目标
后端非正常退出后，持久化的进程记录仍标为 `running`，重启后既不杀真实孤儿进程、状态也不修正 —— 导致 dashboard 显示一堆假 running、孤儿进程失控。重启时需对这些记录做探活+清理。

用户已定策略：**探活，活的才 kill，死了的修正为 exited**。

## 根因
`src/process-manager.ts` 的 `ensureRepository()` 只读取 `processes.json`，从不检查/修复遗留的 running 记录。代码库中完全不存在 reconcile 逻辑（grep 确认）。

## 实现方案（仅改 `src/process-manager.ts` + `src/index.ts`）

### 1. 新增探活 helper `isPidAlive(pid)`
- 用 `process.kill(pid, 0)` 探活（跨平台，Windows 也支持；抛 ESRCH=不存在，EPERM=存在但无权限——都判定为"存在"）。
- pid 为 null/空直接返回 false。

### 2. 新增 `reconcileStaleProcesses()`
启动时调用一次。逻辑：
1. `await ensureRepository()` + `repo.getAll()`
2. 筛出 `status === "running"` 的记录
3. 对每条：
   - `isPidAlive(pid)` 为 true（孤儿仍存活）→ `tree-kill`（复用现有 `killProcessTree`，Windows 用 SIGKILL）→ 等短暂收敛（不阻塞太久）→ 更新记录 `status="exited", stoppedAt=Date.now(), exitCode=null`
   - 已死 → 更新记录 `status="exited", stoppedAt=Date.now(), exitCode=null`
4. `repo.upsert()` 写回修正后的记录
5. `dashboardEvents.emitProcessChange()` 通知 dashboard 刷新
6. 每条处理 serverLog 留痕（"Reconciled stale process ... killed/already-dead"）
- kill 失败不中断整体流程：catch 后记录 status 仍修正（避免卡在假 running），日志记 error。
- 不改内存 `processes` 数组（重启时本就是空的，孤儿不接管到内存管理）。

### 3. 在启动路径挂载
`src/index.ts` 两处启动分支，在 `startHttpServer` **之前**调用 `await reconcileStaleProcesses()`：
- `--server` 分支（cli.server === true）
- 默认 MCP stdio 分支（在 register tools 之后、startHttpServerIfConfigured 之前）
- 用 `try/catch` 包裹，失败仅 serverLog，不阻断启动。

### 4. kill 收敛时机
`tree-kill` 是异步回调，探活判定为活的进程 kill 后不等待 exit（重启阶段不应长时间阻塞）。kill 发出即视为结束、直接标 exited。这是合理取舍：进程已被发信号，状态修正无需等它真退出。

## 验证计划
1. 构造残留：起一个长进程（`node -e "setInterval(()=>0,1000)"`）→ kill 后端（不发 SIGTERM 强杀，模拟崩溃，跳过 cleanup）→ 确认 `processes.json` 仍是 running + 子进程是否还活。
2. 重启后端 → 验证：dashboard（GET /api/processes）该记录变 exited、stoppedAt 已设；若子进程当时还活则被 kill；serverLog 有 reconcile 记录。
3. 边界：已死的 running 记录（pid 不存在）→ 直接标 exited，无报错；无 running 记录时 reconcile 无副作用。
4. `npm run build` 通过；不影响现有 test（reconcile 对空库是 no-op）。

## 不改的东西
- repository 层（processes-repository.ts）：不加新方法，复用 upsert/getAll。
- ProcessRecord 类型：不变。
- 持久化路径、serverId 隔离逻辑：不动。
- cleanup/exit 流程：不动（本次只修"启动恢复"侧）。