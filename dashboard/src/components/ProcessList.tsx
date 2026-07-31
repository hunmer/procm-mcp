import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type Column,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/registry/default/ui/table";
import { Badge } from "@/registry/default/ui/badge";
import { Button } from "@/registry/default/ui/button";
import { Input } from "@/registry/default/ui/input";
import {
  Select,
  SelectItem,
  SelectItemText,
  SelectPopup,
  SelectTrigger,
  SelectValue,
  SelectIcon,
} from "@/registry/default/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/registry/default/ui/pagination";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  EyeIcon,
  InboxIcon,
  RotateCwIcon,
  SearchIcon,
  SquareIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { deleteProcessCall, restartProcess, stopProcess } from "@/lib/api";
import { favoriteSignature } from "@/lib/favorites";
import type { ProcessStatus, ProcessView } from "@/lib/types";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/registry/default/ui/context-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/registry/default/ui/alert-dialog";

interface ProcessListProps {
  processes: ProcessView[];
  selectedId: string | null;
  // Per-process unread log counts, keyed by process id.
  unread: Record<string, number>;
  // Set of favorited launch signatures, so rows show the filled star.
  favoritedSignatures: Set<string>;
  // Toggle favorite for a process: open the favorite dialog when adding.
  onToggleFavorite: (p: ProcessView) => void;
  onSelectLogs: (p: ProcessView) => void;
  onView: (p: ProcessView) => void;
  onToast: (message: string, isError?: boolean) => void;
}

type StatusFilter = "all" | ProcessStatus | "expired";

// Color dot shown before each status option. Mirrors StatusBadge semantics.
const STATUS_DOT: Record<StatusFilter, string> = {
  all: "bg-muted-foreground/50",
  running: "bg-success",
  spawning: "bg-warning",
  exited: "bg-muted-foreground",
  error: "bg-destructive",
  expired: "bg-muted-foreground/30",
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "spawning", label: "Spawning" },
  { value: "exited", label: "Exited" },
  { value: "error", label: "Error" },
  { value: "expired", label: "Stopped (expired)" },
];

const PAGE_SIZE = 8;

export function ProcessList({
  processes,
  selectedId,
  unread,
  favoritedSignatures,
  onToggleFavorite,
  onSelectLogs,
  onView,
  onToast,
}: ProcessListProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [nameFilter, setNameFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });
  // Sort state: default to newest-first by created time.
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  // Process awaiting delete confirmation in the alert dialog.
  const [pendingDelete, setPendingDelete] = useState<ProcessView | null>(null);

  // Open the alert dialog to confirm deleting a process.
  function requestDelete(p: ProcessView) {
    setPendingDelete(p);
  }

  // Actually delete (stops first if running, then erases the record). The
  // backend emits a process-change event so the list refreshes over WS.
  async function confirmDelete() {
    const p = pendingDelete;
    if (!p) return;
    setPendingDelete(null);
    try {
      await deleteProcessCall(p.id);
      onToast(`Deleted ${p.name}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  // Stop (but keep as history) a running process.
  async function handleStop(p: ProcessView) {
    if (p.stoppedAt != null || p.status === "exited" || p.status === "error") return;
    if (!window.confirm(`Stop process ${p.name} (${p.id})?`)) return;
    try {
      await stopProcess(p.id);
      onToast(`Stopped ${p.name}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function handleCopyId(p: ProcessView) {
    try {
      await navigator.clipboard.writeText(p.id);
      onToast(`Copied ID: ${p.id}`);
    } catch {
      onToast("Copy failed", true);
    }
  }

  async function handleRestart(id: string) {
    try {
      await restartProcess(id);
      onToast(`Restarted ${id}`);
      // Same as delete: the WebSocket push handles the list refresh.
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  const columns = useMemo<ColumnDef<ProcessView>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <SortableHeader column={column}>Name</SortableHeader>
        ),
        cell: ({ row }) => {
          const p = row.original;
          return (
            <span className="font-mono text-sm">
              {p.name}
              {p.stoppedAt != null && (
                <span className="text-muted-foreground ml-1.5 text-[10px]">
                  (stopped)
                </span>
              )}
            </span>
          );
        },
      },
      {
        id: "command",
        header: "Command",
        cell: ({ row }) => {
          const p = row.original;
          const cmd = `${p.script}${p.args?.length ? " " + p.args.join(" ") : ""}`;
          return <code className="text-sm">{cmd}</code>;
        },
      },
      {
        id: "desc",
        header: "Description",
        cell: ({ row }) => {
          const desc = row.original.desc;
          return desc ? (
            <span
              className="text-muted-foreground line-clamp-1 max-w-[220px] text-sm"
              title={desc}
            >
              {desc}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          );
        },
      },
      {
        // Creation time. Sorted by default (newest-first). Uses startedAt from
        // the persisted record; live processes without startedAt sort as "now".
        id: "createdAt",
        accessorFn: (p) => p.startedAt ?? 0,
        header: ({ column }) => (
          <SortableHeader column={column}>Created</SortableHeader>
        ),
        cell: ({ row }) => {
          const t = row.original.startedAt;
          return (
            <span
              className="text-muted-foreground text-xs tabular-nums"
              title={t ? new Date(t).toLocaleString() : undefined}
            >
              {t ? new Date(t).toLocaleString() : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <SortableHeader column={column}>Status</SortableHeader>
        ),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "pid",
        header: "PID",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.pid != null ? row.original.pid : "—"}
          </span>
        ),
      },
      {
        accessorKey: "exitCode",
        header: "Exit",
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.exitCode != null ? row.original.exitCode : "—"}
          </span>
        ),
      },
      {
        // Unread live-log count since the panel for this process was last open.
        // Shows a badge only when there are unseen lines.
        id: "unread",
        header: "Logs",
        cell: ({ row }) => {
          const count = unread[row.original.id] ?? 0;
          return count > 0 ? (
            <Badge variant="info" className="tabular-nums">
              {count > 999 ? "999+" : count}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const p = row.original;
          // Expired (stopped) processes can't be restarted, but their logs are
          // still browsable (click the row) and the record can be deleted.
          const isExpired = p.stoppedAt != null;
          // Whether the process can currently be stopped — mirrors the
          // context-menu Stop item (running/spawning only).
          const canStop =
            p.stoppedAt == null &&
            p.status !== "exited" &&
            p.status !== "error";
          return (
            <div
              className="flex justify-end gap-1.5"
              // Prevent row-click (open logs) when interacting with an action.
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={
                  favoritedSignatures.has(favoriteSignature(p))
                    ? `Remove ${p.name} from favorites`
                    : `Add ${p.name} to favorites`
                }
                title={
                  favoritedSignatures.has(favoriteSignature(p))
                    ? "Remove from favorites"
                    : "Add to favorites"
                }
                onClick={() => onToggleFavorite(p)}
                className={favoritedSignatures.has(favoriteSignature(p)) ? "text-warning" : "text-muted-foreground"}
              >
                <StarIcon
                  className={
                    favoritedSignatures.has(favoriteSignature(p))
                      ? "fill-current"
                      : undefined
                  }
                />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Stop ${p.name}`}
                title="Stop (keeps the record)"
                onClick={() => handleStop(p)}
                disabled={!canStop}
                className="text-muted-foreground hover:text-warning"
              >
                <SquareIcon />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Restart ${p.name}`}
                title="Restart"
                onClick={() => handleRestart(p.id)}
                disabled={isExpired}
                className="text-muted-foreground"
              >
                <RotateCwIcon />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${p.name}`}
                title="Delete (stops the process if running)"
                onClick={() => requestDelete(p)}
                className="text-muted-foreground hover:text-destructive"
              >
                <TrashIcon />
              </Button>
            </div>
          );
        },
      },
    ],
    [selectedId, unread, favoritedSignatures, onToggleFavorite, onSelectLogs, onToast],
  );

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
    state: { pagination, sorting },
  });

  const rowCount = table.getRowCount();
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = pagination;
  const rangeStart = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min((pageIndex + 1) * pageSize, rowCount);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Filter bar: status select + name search. Sits above the table. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter((v as StatusFilter) ?? "all")}
        >
          <SelectTrigger size="sm" className="w-[180px]">
            <SelectValue>
              <span className="flex items-center gap-2">
                <span
                  className={
                    "inline-block size-1.5 shrink-0 rounded-full " +
                    STATUS_DOT[statusFilter]
                  }
                />
                {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ??
                  "All statuses"}
              </span>
            </SelectValue>
            <SelectIcon />
          </SelectTrigger>
          <SelectPopup>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <SelectItemText>
                  <span className="flex items-center gap-2">
                    <span
                      className={
                        "inline-block size-1.5 shrink-0 rounded-full " +
                        STATUS_DOT[o.value]
                      }
                    />
                    {o.label}
                  </span>
                </SelectItemText>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <div className="relative min-w-[180px] flex-1">
          <SearchIcon className="text-foreground/50 pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2" />
          <Input
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Filter by name or command…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <span className="text-muted-foreground text-xs">
          {rowCount} of {processes.length}
        </span>
      </div>

      {/* Scrollable table region: fills the remaining height. */}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const p = row.original;
                const isActive = p.id === selectedId;
                const canStop =
                  p.stoppedAt == null &&
                  p.status !== "exited" &&
                  p.status !== "error";
                return (
                  <ContextMenu key={row.id}>
                    <ContextMenuTrigger
                      // Click a row anywhere to open its logs; right-click
                      // opens the context menu. render as the row itself.
                      render={
                        <TableRow
                          className="cursor-pointer"
                          data-state={isActive ? "selected" : undefined}
                          onClick={() => onSelectLogs(p)}
                        />
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </ContextMenuTrigger>
                    <ContextMenuPopup>
                      <ContextMenuItem onClick={() => handleCopyId(p)}>
                        <CopyIcon aria-hidden="true" />
                        Copy ID
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => onView(p)}>
                        <EyeIcon aria-hidden="true" />
                        View
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onClick={() => handleStop(p)}
                        disabled={!canStop}
                      >
                        <SquareIcon aria-hidden="true" />
                        Stop
                      </ContextMenuItem>
                    </ContextMenuPopup>
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
                        ? "No processes yet"
                        : "No processes match the filters"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {processes.length === 0
                        ? "Start a process to see it here."
                        : "Try clearing the status filter or search."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        </Table>
      </div>

      {/* Pagination footer: prev/next + "Viewing X–Y of N". */}
      {rowCount > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2.5">
          <span className="text-muted-foreground whitespace-nowrap text-xs">
            Viewing{" "}
            <strong className="text-foreground font-medium">
              {rangeStart}–{rangeEnd}
            </strong>{" "}
            of <strong className="text-foreground font-medium">{rowCount}</strong>
            {pageCount > 1 && ` · page ${pageIndex + 1}/${pageCount}`}
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Previous page"
                  disabled={!table.getCanPreviousPage()}
                  onClick={() => table.previousPage()}
                >
                  <ChevronLeftIcon />
                </Button>
              </PaginationItem>
              <PaginationItem>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Next page"
                  disabled={!table.getCanNextPage()}
                  onClick={() => table.nextPage()}
                >
                  <ChevronRightIcon />
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Delete confirmation. Triggered from the row action button or the
          context menu (both call requestDelete). */}
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete process?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (() => {
                const running =
                  pendingDelete.stoppedAt == null &&
                  pendingDelete.status !== "exited" &&
                  pendingDelete.status !== "error";
                return running
                  ? `This will stop “${pendingDelete.name}” (${pendingDelete.id}) and erase its record. This action cannot be undone.`
                  : `This will erase the record for “${pendingDelete.name}” (${pendingDelete.id}). This action cannot be undone.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              Cancel
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}

// A clickable column header that toggles sort direction (asc → desc → cleared)
// and shows the current direction with an icon. Used by the sortable columns.
function SortableHeader({
  column,
  children,
}: {
  column: Column<ProcessView>;
  children: React.ReactNode;
}) {
  const dir = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className="group inline-flex items-center gap-1 whitespace-nowrap"
    >
      {children}
      <span className="text-muted-foreground inline-flex">
        {dir === "asc" ? (
          <ArrowUpIcon className="size-3.5" />
        ) : dir === "desc" ? (
          <ArrowDownIcon className="size-3.5" />
        ) : (
          <ArrowDownIcon className="size-3.5 opacity-0 group-hover:opacity-50" />
        )}
      </span>
    </button>
  );
}
