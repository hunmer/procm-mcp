import { useMemo, useState } from "react";
import {
  type PaginationState,
  type SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  PAGE_SIZE,
  VIEW_KEY,
  type ProcessListProps,
  type RowActions,
  type StatusFilter,
  type ViewMode,
} from "./process-list/types";
import { loadViewMode } from "./process-list/utils";
import { useProcessActions } from "./process-list/useProcessActions";
import { useProcessColumns } from "./process-list/useProcessColumns";
import { ProcessFilterBar } from "./process-list/ProcessFilterBar";
import { ProcessTableView } from "./process-list/ProcessTableView";
import { ProcessCardsView } from "./process-list/ProcessCardsView";
import { ProcessPagination } from "./process-list/ProcessPagination";
import { ProcessDialogs } from "./process-list/ProcessDialogs";

export function ProcessList({
  processes,
  selectedId,
  now,
  unread,
  favoritedSignatures,
  onToggleFavorite,
  onSelectLogs,
  onView,
  onToast,
}: ProcessListProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [nameFilter, setNameFilter] = useState("");
  // Layout (table vs cards). Persisted to localStorage, matching the
  // useTheme.ts / i18n.ts pattern (best-effort; may be unavailable).
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });
  // Sort state: default to newest-first by created time.
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);

  const {
    pendingDelete,
    pendingStop,
    requestDelete,
    requestStop,
    confirmDelete,
    confirmStop,
    handleRestart,
    handleCopyId,
    handleCopyCommand,
    dismissDelete,
    dismissStop,
  } = useProcessActions(onToast);

  const columns = useProcessColumns({
    now,
    unread,
    favoritedSignatures,
    onToggleFavorite,
    onRestart: handleRestart,
    onRequestStop: requestStop,
    onRequestDelete: requestDelete,
  });

  // Bundle the per-row callbacks so the views and the context menu take a
  // single prop instead of a long argument list.
  const actions: RowActions = {
    onSelectLogs,
    onView,
    onToggleFavorite,
    onRestart: handleRestart,
    onRequestStop: requestStop,
    onRequestDelete: requestDelete,
    onCopyId: handleCopyId,
    onCopyCommand: handleCopyCommand,
  };

  // Client-side filtering by status and name. "expired" is a UI-only filter
  // (stoppedAt != null) that doesn't exist in the ProcessStatus enum.
  const filteredData = useMemo(() => {
    let rows = processes;
    if (statusFilter === "expired") {
      rows = rows.filter((p) => p.stoppedAt != null);
    } else if (statusFilter !== "all") {
      rows = rows.filter((p) => p.status === statusFilter);
    }
    const q = nameFilter.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.script.toLowerCase().includes(q) ||
          (p.desc?.toLowerCase().includes(q) ?? false),
      );
    }
    return rows;
  }, [processes, statusFilter, nameFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    // Don't reset to page 0 on every sort change — let the user stay oriented;
    // the index is clamped by tanstack anyway.
    autoResetPageIndex: false,
    // Pin the name column to the left and actions to the right so both stay
    // visible during horizontal scroll. Uncontrolled (no state/onChange pair),
    // so pinning is fixed for this view; pinnedColAttrs reads it back via the
    // column API (getIsPinned / getStart / getAfter).
    initialState: {
      columnPinning: { left: ["name"], right: ["actions"] },
    },
    state: { pagination, sorting },
  });

  const rowCount = table.getRowCount();
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = pagination;
  const rangeStart = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min((pageIndex + 1) * pageSize, rowCount);

  // Switch the list layout and persist the choice (best-effort).
  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // localStorage may be unavailable (private mode); ignore.
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProcessFilterBar
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        nameFilter={nameFilter}
        onNameFilterChange={setNameFilter}
        viewMode={viewMode}
        onViewModeChange={changeViewMode}
        shownCount={rowCount}
        totalCount={processes.length}
      />

      {/* Scrollable region: table or cards, depending on viewMode. */}
      {viewMode === "cards" ? (
        <ProcessCardsView
          table={table}
          selectedId={selectedId}
          now={now}
          unread={unread}
          favoritedSignatures={favoritedSignatures}
          processes={processes}
          actions={actions}
        />
      ) : (
        <ProcessTableView
          table={table}
          columns={columns}
          selectedId={selectedId}
          processes={processes}
          actions={actions}
        />
      )}

      {/* Pagination footer: prev/next + "Viewing X–Y of N". */}
      {rowCount > 0 && (
        <ProcessPagination
          table={table}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          rowCount={rowCount}
          pageCount={pageCount}
          pageIndex={pageIndex}
        />
      )}

      <ProcessDialogs
        pendingDelete={pendingDelete}
        pendingStop={pendingStop}
        onConfirmDelete={confirmDelete}
        onConfirmStop={confirmStop}
        onDismissDelete={dismissDelete}
        onDismissStop={dismissStop}
      />
    </div>
  );
}
