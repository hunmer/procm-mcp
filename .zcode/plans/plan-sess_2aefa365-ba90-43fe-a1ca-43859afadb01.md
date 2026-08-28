## Goal
在进程列表（`dashboard/src/components/ProcessList.tsx`）展示每个进程「距离上一次重启」的运行时长，精确到每次重启（新增后端字段 `lastStartedAt`），仅对 running/spawning 显示，其它状态显示 `—`。

## 现状与关键发现
- 现有 `startedAt` 是「首次启动时间」，**重启时被故意保留**（`processes-repository.ts:89` + `process-manager.ts` restartProcess 不调 pushProcess）。用它算不出「距上次重启」。
- 因此需新增 `lastStartedAt` 字段：每次重启都重置。
- WS 推送用的是 `websocket-server.ts:16` 的本地 `toPublicView`（输入 `ProcessRecord`，含时间戳）；HTTP 初始加载用 `http-server.ts:92` 的 `toPublicRecord`。两者都要加该字段。
- 数据源是 `listProcessRecords()` → 持久化 `ProcessRecord`，所以新字段必须加到 `ProcessRecord` 类型并在 `toRecord` 里赋值，才能经持久化 + WS/HTTP 双通道到达前端。
- live-restart 分支（`restartProcess` line 513）**绕过 pushProcess**，需单独显式 `lastStartedAtByMeta.set(id, Date.now())`。
- 后端已 `formatUptime` 的本地实现（`App.tsx:587`），但它是 `App.tsx` 文件内私有函数；为避免重复，我会把格式化逻辑内联到一个小的共享 helper。

## 改动清单

### 后端 (`src/`)
1. **`src/processes-repository.ts`**
   - `ProcessRecord`（line 21 后）：新增 `// Epoch ms of the most recent start; reset on every restart.` + `lastStartedAt?: number | null;`（可选，兼容旧存量记录，与 `envs`/`stdoutLogPath` 同模式）。
   - `upsert`（line 78-93）：**不**为 lastStartedAt 加 preserve 逻辑（`...record` 展开已让新值胜出）；更新 line 74-77 注释说明 lastStartedAt 不被保留。

2. **`src/process-manager.ts`**
   - line 140 后：新增 `const lastStartedAtByMeta = new Map<string, number>();`（配同款注释）。
   - `toRecord`（line 125 后）：新增 `lastStartedAt: lastStartedAtByMeta.get(meta.id) ?? startedAt,`（fallback 到 startedAt，保证旧/未设值记录仍合理）。
   - `pushProcess`（line 597 后）：新增 `lastStartedAtByMeta.set(metadata.id, Date.now());`（覆盖所有新注册入口：MCP tool / HTTP start / revive 分支）。
   - `restartProcess` live 分支（line 513 `processes[processIndex] = newProcess;` 后）：新增 `lastStartedAtByMeta.set(id, Date.now());`（这是唯一绕过 pushProcess 的重启路径，必须显式重置）。

3. **`src/websocket-server.ts`** — `toPublicView`（line 104 后）：新增 `lastStartedAt: p.lastStartedAt ?? undefined,`（WS 推送通道）。

4. **`src/http-server.ts`** — `toPublicRecord`（line 104 后）：新增 `lastStartedAt: p.lastStartedAt ?? undefined,`（HTTP 初始加载通道）。

### 前端 (`dashboard/src/`)
5. **`dashboard/src/lib/types.ts`** — `ProcessView`（line 20 后）：新增 `// Epoch ms of the most recent start (reset on every restart); used to show uptime.` + `lastStartedAt?: number | null;`。

6. **`dashboard/src/components/ProcessList.tsx`**
   - 顶部加一个本地 `formatUptime(ms)` 辅助函数（复用 `App.tsx:587` 同款格式 `"1h 02m 03s"`/`"02m 03s"`/`"03s"`）。鉴于 `App.tsx` 的同名函数是私有的，且仅此两处用，为最小改动我把它作为 `ProcessList.tsx` 内的本地辅助（避免重构 App.tsx 的导出结构）。—— *备选：抽到 `lib/utils.ts` 供两处共享；如偏好此项请告知。*
   - 新增 `now: number` prop（由 App.tsx 的每秒 tick 传入，复用既有 live-uptime 模式）。
   - 在 `columns` 的 `createdAt` 列（line 264-283）**之后**新增一个 `uptime` 列：
     - `header` = `t("processes.colUptime")`（不可排序，简化实现）。
     - `cell`：当 `p.status === "running" || p.status === "spawning"` 且 `p.lastStartedAt` 存在 → 显示 `formatUptime(now - lastStartedAt)`；否则 `<span className="text-muted-foreground text-xs">—</span>`。样式与 createdAt 列一致（`text-muted-foreground text-xs tabular-nums`，带 `title` 提示绝对时间）。

7. **`dashboard/src/components/App.tsx`**
   - `<ProcessList>` 调用处（line 468-480）：传入 `now={now}`（`now` state 已存在于 line 62，每秒更新）。

### i18n（`dashboard/src/locales/`）
8. **`en.json`** — `processes` 下新增 `"colUptime": "Uptime"`。
9. **`zh.json`** — `processes` 下新增 `"colUptime": "运行时长"`。

## 行为
- running/spawning 行：实时显示「距上次重启」的运行时长，每秒刷新。
- exited/error/stopped（`stoppedAt != null`）：显示 `—`。
- 旧记录（后端无 lastStartedAt）→ fallback 用 startedAt，仍显示合理时长（仅对新启动/重启进程完全精确）。
- 列宽影响：新增一列，表格已有横向滚动/`whitespace-nowrap`，不影响布局。

## 验证
- 后端编译：`cd G:\procm-mcp && npm run build`（tsc）。
- 前端类型检查/构建：`cd G:\procm-mcp\dashboard && npm run build`。
- 手动：启动一个 preset 进程 → 列表显示 uptime 计时；点重启 → uptime 从 0 重新计（验证 lastStartedAt 重置）；停止/退出后 → 显示 `—`。

## 待确认
- `formatUptime` 是否抽到共享 `lib/utils.ts`？默认我**内联在 ProcessList.tsx**（最小改动，与 App.tsx 现状一致）；如要消除重复请说明，我会抽成共享并让两处都引用。