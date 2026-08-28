import { useTranslation } from "react-i18next";
import {
  type ColumnDef,
  type Table as TableInstance,
  flexRender,
} from "@tanstack/react-table";
import { InboxIcon } from "lucide-react";
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
import { Skeleton } from "@/registry/default/ui/skeleton";
import type { ProcessRow, RowActions } from "./types";
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
              [colWidthClass(column), pin.className].filter(Boolean).join(" ") ||
              undefined
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

// The row/table layout. Pinned columns (name left, actions right) stay visible
// during horizontal scroll via pinnedColAttrs; colWidthClass applies the
// per-column fixed widths from the columnDef meta. `isolate` scopes pinned
// cells' z-index to the table. Each row is a ContextMenu trigger (click
// selects it for the right-hand panel, right-click opens the menu).
export function SystemProcessTableView({
  table,
  columns,
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
  return (
    <div className="isolate min-h-0 flex-1 overflow-auto">
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
          {loading ? (
            Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <TableRowSkeleton key={i} table={table} />
            ))
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => {
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
                            [width, pin.className].filter(Boolean).join(" ") ||
                            undefined
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
            })
          ) : (
            <TableRow>
              <TableCell className="p-0" colSpan={columns.length}>
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <InboxIcon />
                    </EmptyMedia>
                    <EmptyTitle>
                      {hasData ? t("system.emptyFiltered") : t("system.empty")}
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
