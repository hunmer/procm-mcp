## 精简 MCP tools：14 → 6

把所有「同类」工具合并成「名词工具 + action 枚举」，与你的示例 `process delete/reset/get` 一致。

### 新工具集（6 个）

| 新工具 | 取代 | schema |
|---|---|---|
| `process` | get-process-info / delete-process / restart-process / list-processes | `{ action: get\|delete\|restart\|list, id? }` (get/delete/restart 需 id) |
| `start-process` | （保留不变） | `{ script, args?, cwd, envs?, name?, desc? }` |
| `process-logs` | get-process-stdout / get-process-stderr / grep-process-logs | `{ id, stream?: stdout\|stderr, pattern?, count?, ignoreCase? }` — 有 `pattern`=grep(无 stream 则查两端, count 默认 50)，无 `pattern`=tail(stream 默认 stdout, count 默认 10) |
| `allowed-process` | allow-start-process / delete-allowed-process / list-allowed-processes-in-cwd | `{ action: allow\|delete\|list, script?, args?, cwd? }` |
| `procm-command` | get-procm-commands / start-procm-command | `{ action: list\|start, name?, cwd? }` |
| `get-server-id` | （保留，唯一无同类） | `{}` |

### 关键决策（可推翻）
1. **`start-process` 不并入 `process`**：它的必填字段集完全不同（script/cwd 等），强行并入会让 schema 把「按动作变化的必填项」混在一起，反而更难用、对 LLM 不够自解释。保留它独立，`process` 只收按-id 与 list 操作。如你想极致合并（含 start），告诉我即可。
2. **action 取值用 `restart` 而非 `reset`**：与现有代码一致（`restartProcess()`、REST `/restart`、CLI `restart`），避免改语义。
3. **不保留旧工具名别名**：「精简」即去除冗余，加别名会让工具列表反而变长。这是破坏性变更（旧调用方需改工具名）。
4. **运行时校验**：action 需要 id 但没传时，返回清晰的文本错误（discriminated 工具的标准做法）。

### 文件改动
**源码（`src/`）**
- `src/tools/process.ts` → 改写：`process`（action 分支复用现有 `getProcess/removeProcess/restartProcess/listProcesses`）+ 保留 `start-process`。
- `src/tools/process-logs.ts` → 合并 `grep-logs.ts` 进来，改写为 `process-logs`（复用现有 `stdoutClient.top/search`、`stderrClient.top/search`）。
- 删除 `src/tools/grep-logs.ts`。
- `src/tools/allowed-process.ts` → 改写为 `allowed-process`（复用现有 `allowProcessCreation/deleteAllowedProcessCreation/getAllowedProcesses`）。
- `src/tools/procm-commands.ts` → 改写为 `procm-command`（复用现有 `readCommandsFile` 等内部函数）。
- `src/tools/server-info.ts` → 不变。
- `src/index.ts` & `src/mcp-http.ts` → 更新 import（去掉 grep-logs）与 register 调用。

**测试（`tests/`）**
- `tests/mcp-http.mjs`：`14 tools`→`6`；`list-processes` 调用→`process`(action:list)；`allow-start-process`→`allowed-process`(action:allow)；`names.includes("grep-process-logs")`→`process-logs`。`start-process` 调用不变。
- `tests/allow-x.mjs`：`allow-start-process`→`allowed-process`(action:allow)；`start-process` 不变。

**文档**
- `README.md`：工具清单（约 176–208 行）整段重写为 6 个工具；「the same 14 tools」(110 行) → 6。
- `CLAUDE.md`、`claude/*.md`：更新工具名引用。

**不受影响**：`cli-client.ts`、`http-server.ts`、`dashboard/`（均走 REST，不碰 MCP 工具名）。

### 验证
- `npm run build`（TypeScript 编译通过）
- `node tests/run-all.mjs`（确认 mcp-http.mjs / allow-x.mjs 全绿）
- 人工核对 `tools/list` 返回恰好 6 个工具