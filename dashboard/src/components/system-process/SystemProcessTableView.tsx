import { useTranslation } from "react-i18next";
import {
  type ColumnDef,
  type Table as TableInstance,
  flexRender,
} from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon, InboxIcon } from "lucide-react";
import { buttonVariants } from "@/registry/default/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/registry/default/ui/table";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/registry/default/ui/context-menu";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/registry/default/ui/pagination";
import {
  Select,
  SelectItem,
  SelectItemText,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/registry/default/ui/select";
import { Skeleton } from "@/registry/default/ui/skeleton";
import { PAGE_SIZE_OPTIONS, type ProcessRow, type RowActions } from "./types";
import { colWidthClass, pinnedColAttrs } from "./utils";
import { SystemProcessContextMenu } from "./SystemProcessContextMenu";

// How many placeholder rows the first-load skeleton shows.
const SKELETON_ROWS = 8;

// First-load placeholder mirroring the real row geometry (per-column widths +
// pinned-edge borders) so the swap to data doesn't shift the layout.
// p-skeleton-1: https://coss.com/ui/r/p-skeleton-1.json
function TableRowSkeleton({ table }: { table: TableInstance<ProcessRow> }) {
  return (
    <TableRow>
      {table.getVisibleLeafColumns().map((column) => {
        const pin = pinnedColAttrs(column, false);
        return (
          <TableCell
            key={column.id}
            className={
              [colWidthClass(column), pin.className]
                .filter(Boolean)
                .join(" ") || undefined
            }
            style={pin.style}
          >
            <Skeleton className="h-4 w-full" />
          </TableCell>
        );
      })}
    </TableRow>
  );
}

// p-table-4-style pagination footer: a result-range select (jumps to that
// page) plus previous/next buttons, pinned below the scroll area.
// https://coss.com/ui/r/p-table-4.json
function TablePaginationFooter({
  table,
}: {
  table: TableInstance<ProcessRow>;
}) {
  const { t } = useTranslation();
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const rowCount = table.getRowCount();
  const rangeLabel = (page: number) =>
    `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, rowCount)}`;
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2">
      {/* Page size selector (p-table-3-style) + result range selector */}
      <div className="flex items-center gap-2 whitespace-nowrap">
        <p className="text-muted-foreground text-sm">
          {t("system.pageSizeLabel")}
        </p>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => table.setPageSize(Number(v))}
        >
          <SelectTrigger
            aria-label={t("system.pageSizeLabel")}
            className="w-fit"
            size="sm"
          >
            <SelectValue>{pageSize}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                <SelectItemText>{n}</SelectItemText>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <p className="text-muted-foreground text-sm">
          {t("system.pageViewing")}
        </p>
        <Select
          value={String(pageIndex + 1)}
          onValueChange={(v) => table.setPageIndex(Number(v) - 1)}
        >
          <SelectTrigger
            aria-label={t("system.pageRangeLabel")}
            className="w-fit"
            size="sm"
          >
            <SelectValue>{rangeLabel(pageIndex)}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {Array.from({ length: pageCount }, (_, i) => (
              <SelectItem key={i} value={String(i + 1)}>
                <SelectItemText>{rangeLabel(i)}</SelectItemText>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <p className="text-muted-foreground text-sm">
          {t("system.pageOfTotal", { count: rowCount })}
        </p>
      </div>

      {/* Previous/next */}
      <Pagination className="justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              className={buttonVariants({ size: "sm", variant: "outline" })}
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeftIcon />
              {t("system.pagePrev")}
            </PaginationPrevious>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              className={buttonVariants({ size: "sm", variant: "outline" })}
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              {t("system.pageNext")}
              <ChevronRightIcon />
            </PaginationNext>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

// The row/table layout. Pinned columns (name left, actions right) stay visible
// during horizontal scroll via pinnedColAttrs; colWidthClass applies the
// per-column fixed widths from the columnDef meta. `isolate` scopes pinned
// cells' z-index to the table. Each row is a ContextMenu trigger (click
// selects it for the right-hand panel, right-click opens the menu).
export function SystemProcessTableView({
  table,
  selectedKey,
  hasData,
  loading = false,
  actions,
}: {
  table: TableInstance<ProcessRow>;
  columns: ColumnDef<ProcessRow>[];
  selectedKey: string | null;
  // Whether the last snapshot had any process at all — distinguishes the
  // "no processes" empty state from the "filters matched nothing" one.
  hasData: boolean;
  // First load only (snapshot not yet fetched): skeleton rows instead of the
  // empty state. Background refreshes keep the stale rows visible.
  loading?: boolean;
  actions: RowActions;
}) {
  const { t } = useTranslation();
  const rows = table.getRowModel().rows;
  // Empty state renders outside the table so it isn't squeezed into the
  // table-body layout.
  const showEmpty = !loading && rows.length === 0;
  const showFooter = !loading && table.getRowCount() > 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="isolate min-h-0 flex-1 overflow-auto">
        {showEmpty ? (
          <Empty className="h-full w-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>
                {hasData ? t("system.emptyFiltered") : t("system.empty")}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const pin = pinnedColAttrs(header.column, true);
                    const width = colWidthClass(header.column);
                    return (
                      <TableHead
                        key={header.id}
                        className={
                          [width, pin.className].filter(Boolean).join(" ") ||
                          undefined
                        }
                        style={pin.style}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <TableRowSkeleton key={i} table={table} />
                  ))
                : rows.map((row) => {
                    const r = row.original;
                    return (
                      <ContextMenu key={row.id}>
                        {/* Right-click opens the context menu (View info / Open
                            location / Kill). Render as the row itself, matching
                            the Processes table's trigger pattern. */}
                        <ContextMenuTrigger
                          render={
                            <TableRow
                              className="group cursor-pointer"
                              data-state={
                                selectedKey === r.key ? "selected" : undefined
                              }
                              title={
                                r.members.length > 1
                                  ? t("system.rowGroupHint", {
                                      name: r.name,
                                      count: r.members.length,
                                    })
                                  : t("system.rowHint", {
                                      name: r.name,
                                      pid: r.pid,
                                    })
                              }
                              onClick={() => actions.onSelect(r)}
                            />
                          }
                        >
                          {row.getVisibleCells().map((cell) => {
                            const pin = pinnedColAttrs(cell.column, false);
                            const width = colWidthClass(cell.column);
                            return (
                              <TableCell
                                key={cell.id}
                                className={
                                  [width, pin.className]
                                    .filter(Boolean)
                                    .join(" ") || undefined
                                }
                                style={pin.style}
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </TableCell>
                            );
                          })}
                        </ContextMenuTrigger>
                        <SystemProcessContextMenu row={r} actions={actions} />
                      </ContextMenu>
                    );
                  })}
            </TableBody>
          </Table>
        )}
      </div>
      {showFooter && <TablePaginationFooter table={table} />}
    </div>
  );
}
