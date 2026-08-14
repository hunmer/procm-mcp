## 目标
把 `dashboard/src/components/ProcessList.tsx`（1125 行）按职责拆分到 `components/process-list/` 子目录，公共导出 `ProcessList` 不变（`App.tsx` 的 `import { ProcessList } from "./ProcessList"` 无需改动），功能与渲染结果完全一致。

## 文件结构（13 个文件）

```
components/
  ProcessList.tsx              ← 精简的编排组件（保留 export function ProcessList）
  process-list/
    types.ts                   类型 + 常量
    utils.ts                   纯函数
    useProcessActions.ts       action handlers + 弹窗状态
    useProcessColumns.ts       列定义 hook
    SortableHeader.tsx         可排序列头
    ProcessActions.tsx         行/卡片操作按钮
    ProcessCardBody.tsx        卡片头部
    ProcessContextMenu.tsx     右键菜单（表格/卡片共用，去重）
    ProcessFilterBar.tsx       状态筛选 + 搜索 + 视图切换
    ProcessTableView.tsx       表格视图
    ProcessCardsView.tsx       卡片视图
    ProcessPagination.tsx      分页页脚
    ProcessDialogs.tsx         删除/停止确认弹窗
```

## 各文件职责与关键点

### `types.ts`
- 迁移：`ProcessListProps`、`StatusFilter`、`STATUS_DOT`、`STATUS_OPTIONS`、`PAGE_SIZE`、`ViewMode`、`VIEW_KEY`。
- 新增 `RowActions` 接口：把 8 个逐行回调（`onSelectLogs/onView/onToggleFavorite/onRestart/onRequestStop/onRequestDelete/onCopyId/onCopyCommand`）打包，作为单一对象下发给视图/列/菜单，避免长参数列表。

### `utils.ts`
- 迁移：`loadViewMode`、`formatUptime`、`pinnedColAttrs`。
- 新增 `canStopProcess(p)` = `p.stoppedAt == null && p.status !== "exited" && p.status !== "error"`，替换原本散落在 `ProcessActions`、卡片视图、表格视图、`requestStop`、`requestDelete`、删除弹窗里的 4+ 处重复判断（语义完全一致）。

### `useProcessActions.ts`
- 自定义 hook，内部 `useTranslation()`，持有 `pendingDelete`/`pendingStop` 状态。
- 返回：`requestDelete / requestStop / confirmDelete / confirmStop / handleCopyId / handleCopyCommand / handleRestart / dismissDelete / dismissStop / pendingDelete / pendingStop`。逻辑逐行搬自原组件（`doDelete` 先停后删、stop 仅 running/spawning、copy 走 clipboard + toast）。

### `useProcessColumns.ts`
- `useProcessColumns({ now, unread, favoritedSignatures, onToggleFavorite, onRestart, onRequestStop, onRequestDelete })` 返回 `ColumnDef<ProcessView>[]`，列定义逐行搬移；`ProcessActions` 单元格改用传入的回调。

### 展示子组件 `SortableHeader / ProcessActions / ProcessCardBody`
- 逐行搬移，签名不变。`ProcessActions` 内 `canStop` 改用 `canStopProcess(p)`。

### `ProcessContextMenu.tsx`（新增，去重）
- 把表格视图与卡片视图中**完全相同**的 `<ContextMenuPopup>` 块抽成一个组件，接收 `{ p, actions }`。渲染结果与原两处一致。

### 视图组件 `ProcessFilterBar / ProcessTableView / ProcessCardsView / ProcessPagination / ProcessDialogs`
- 各自封装原 render 的对应区段，接收 props（含 `table` 实例、`actions`、`selectedId` 等）。
- 空态分支（`processes.length === 0 ? emptyNoProcesses : emptyNoMatches`）原样保留；表格空态仍用 `TableRow/TableCell colSpan={columns.length}`，卡片空态仍用 `mx-auto max-w-sm py-16`。

### `ProcessList.tsx`（编排）
- 持有 `statusFilter/nameFilter/viewMode/pagination/sorting` 状态。
- 调 `useProcessActions`、`useProcessColumns`、`filteredData` useMemo、`useReactTable`（initialState columnPinning、autoResetPageIndex 等不变）。
- 组装 `actions: RowActions` 并下发给视图；计算 `rangeStart/rangeEnd/pageCount`；保留 `changeViewMode`（写 localStorage）。
- 渲染：`ProcessFilterBar` → (`ProcessCardsView` | `ProcessTableView`) → `ProcessPagination`（仅 `rowCount>0`）→ `ProcessDialogs`。

## 行为保真要点
- 不改 props、不改 i18n key、不改 className、不改事件行为、不改列顺序/默认排序/分页大小/列固定。
- 列定义 useMemo 的依赖保持原有触发语义（按 `now/unread/favoritedSignatures/onToggleFavorite` 等），不引入新的功能差异。
- `verbatimModuleSyntax`/`noUnusedLocals`/`noUnusedParameters` 已开启，所有 type-only 导入用 `import type`，移除各文件未用导入。

## 验证
- 实现后运行 `cd dashboard && npx tsc -b`（构建链中的类型检查步骤）确认零类型错误。
- 不改 `App.tsx` 等其它文件；公共 API 与渲染输出不变。
