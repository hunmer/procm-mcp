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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import type { ProcessView } from "@/lib/types";
import { pinnedColAttrs } from "./utils";
import { ProcessContextMenu } from "./ProcessContextMenu";
import type { RowActions } from "./types";

// The row/table layout. Pinned columns (name left, actions right) stay visible
// during horizontal scroll via pinnedColAttrs. `isolate` scopes pinned cells'
// z-index to the table so they never clash with floating UI outside it. Each
// row is a ContextMenu trigger (click opens logs, right-click opens the menu).
export function ProcessTableView({
  table,
  columns,
  selectedId,
  processes,
  actions,
}: {
  table: TableInstance<ProcessView>;
  columns: ColumnDef<ProcessView>[];
  selectedId: string | null;
  processes: ProcessView[];
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
                return (
                  <TableHead
                    key={header.id}
                    className={pin.className}
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
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => {
              const p = row.original;
              const isActive = p.id === selectedId;
              return (
                <ContextMenu key={row.id}>
                  <ContextMenuTrigger
                    // Click a row anywhere to open its logs; right-click
                    // opens the context menu. render as the row itself.
                    render={
                      <TableRow
                        className="group cursor-pointer"
                        data-state={isActive ? "selected" : undefined}
                        onClick={() => actions.onSelectLogs(p)}
                      />
                    }
                  >
                    {row.getVisibleCells().map((cell) => {
                      const pin = pinnedColAttrs(cell.column, false);
                      return (
                        <TableCell
                          key={cell.id}
                          className={pin.className}
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
                  <ProcessContextMenu p={p} actions={actions} />
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
                      {processes.length === 0
                        ? t("processes.emptyNoProcesses")
                        : t("processes.emptyNoMatches")}
                    </EmptyTitle>
                    <EmptyDescription>
                      {processes.length === 0
                        ? t("processes.emptyDescNoProcesses")
                        : t("processes.emptyDescNoMatches")}
                    </EmptyDescription>
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
