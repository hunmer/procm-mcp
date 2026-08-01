import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  PlayIcon,
  SearchIcon,
  SquareIcon,
  SquareTerminalIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import {
  deleteProcessCall,
  getProcessCommand,
  restartProcess,
  stopProcess,
} from "@/lib/api";
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

const STATUS_OPTIONS: { value: StatusFilter; labelKey: string }[] = [
  { value: "all", labelKey: "processes.filterAll" },
  { value: "running", labelKey: "processes.filterRunning" },
  { value: "spawning", labelKey: "processes.filterSpawning" },
  { value: "exited", labelKey: "processes.filterExited" },
  { value: "error", labelKey: "processes.filterError" },
  { value: "expired", labelKey: "processes.filterExpired" },
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
  const { t } = useTranslation();
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
  // Process awaiting stop confirmation in the alert dialog.
  const [pendingStop, setPendingStop] = useState<ProcessView | null>(null);

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
      onToast(t("processes.toastDeleted", { name: p.name }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  // Open the alert dialog to confirm stopping a process. Only running/spawning
  // processes can be stopped; the caller (row button / context menu) is
  // responsible for gating on `canStop`, but we double-check defensively.
  function requestStop(p: ProcessView) {
    if (p.stoppedAt != null || p.status === "exited" || p.status === "error") return;
    setPendingStop(p);
  }

  // Actually stop the process (keeps its record as history).
  async function confirmStop() {
    const p = pendingStop;
    if (!p) return;
    setPendingStop(null);
    try {
      await stopProcess(p.id);
      onToast(t("processes.toastStopped", { name: p.name }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function handleCopyId(p: ProcessView) {
    try {
      await navigator.clipboard.writeText(p.id);
      onToast(t("processes.toastCopiedId", { id: p.id }));
    } catch {
      onToast(t("processes.toastCopyFailed"), true);
    }
  }

  // Copy a complete, paste-and-run terminal command for the process. Built on
  // the backend (cd to cwd + env-var prefixes + `script args`), formatted for
  // the backend's own OS. Works for any process that has ever run: live
  // processes include env-var prefixes; historical records omit them (envs
  // aren't persisted) but still copy script+args+cwd.
  async function handleCopyCommand(p: ProcessView) {
    try {
      const { command } = await getProcessCommand(p.id);
      await navigator.clipboard.writeText(command);
      onToast(t("processes.toastCopiedCommand"));
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function handleRestart(id: string) {
    try {
      await restartProcess(id);
      onToast(t("processes.toastRestarted", { id }));
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
          <SortableHeader column={column}>{t("processes.colName")}</SortableHeader>
        ),
        cell: ({ row }) => {
          const p = row.original;
          return <span className="font-mono text-sm">{p.name}</span>;
        },
      },
      {
        id: "command",
        header: t("processes.colCommand"),
        cell: ({ row }) => {
          const p = row.original;
          const cmd = `${p.script}${p.args?.length ? " " + p.args.join(" ") : ""}`;
          return <code className="text-sm">{cmd}</code>;
        },
      },
      {
        id: "desc",
        header: t("processes.colDescription"),
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
          <SortableHeader column={column}>{t("processes.colCreated")}</SortableHeader>
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
          <SortableHeader column={column}>{t("processes.colStatus")}</SortableHeader>
        ),
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status}
            error={row.original.error}
          />
        ),
      },
      {
        accessorKey: "pid",
        header: t("processes.colPid"),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.pid != null ? row.original.pid : "—"}
          </span>
        ),
      },
      {
        accessorKey: "exitCode",
        header: t("processes.colExit"),
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
        header: t("processes.colLogs"),
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
        header: () => <div className="text-right">{t("processes.colActions")}</div>,
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
                    ? t("processes.removeFavoriteAria", { name: p.name })
                    : t("processes.addFavoriteAria", { name: p.name })
                }
                title={
                  favoritedSignatures.has(favoriteSignature(p))
                    ? t("processes.removeFavoriteTitle")
                    : t("processes.addFavoriteTitle")
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
              {canStop ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("processes.stopAria", { name: p.name })}
                  title={t("processes.stopTitle")}
                  onClick={() => requestStop(p)}
                  className="text-muted-foreground hover:text-warning"
                >
                  <SquareIcon />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("processes.runAria", { name: p.name })}
                  title={t("processes.runTitle")}
                  onClick={() => handleRestart(p.id)}
                  disabled={isExpired}
                  className="text-muted-foreground hover:text-success"
                >
                  <PlayIcon />
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("processes.deleteAria", { name: p.name })}
                title={t("processes.deleteTitle")}
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
                {STATUS_OPTIONS.find((o) => o.value === statusFilter)
                  ? t(STATUS_OPTIONS.find((o) => o.value === statusFilter)!.labelKey)
                  : t("processes.filterAll")}
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
                    {t(o.labelKey)}
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
            placeholder={t("processes.filterPlaceholder")}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <span className="text-muted-foreground text-xs">
          {t("processes.countOfTotal", { shown: rowCount, total: processes.length })}
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
                        {t("processes.ctxCopyId")}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleCopyCommand(p)}>
                        <SquareTerminalIcon aria-hidden="true" />
                        {t("processes.ctxCopyCommand")}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => onView(p)}>
                        <EyeIcon aria-hidden="true" />
                        {t("processes.ctxView")}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        onClick={() => requestStop(p)}
                        disabled={!canStop}
                      >
                        <SquareIcon aria-hidden="true" />
                        {t("processes.ctxStop")}
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

      {/* Pagination footer: prev/next + "Viewing X–Y of N". */}
      {rowCount > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2.5">
          <span className="text-muted-foreground whitespace-nowrap text-xs">
            {t("processes.paginationViewing", {
              start: rangeStart,
              end: rangeEnd,
              total: rowCount,
            })}
            {pageCount > 1 &&
              t("processes.paginationPage", { page: pageIndex + 1, pages: pageCount })}
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={t("processes.previousPage")}
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
                  aria-label={t("processes.nextPage")}
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
            <AlertDialogTitle>{t("processes.deleteQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (() => {
                const running =
                  pendingDelete.stoppedAt == null &&
                  pendingDelete.status !== "exited" &&
                  pendingDelete.status !== "error";
                return running
                  ? t("processes.deleteDescriptionRunning", { name: pendingDelete.name, id: pendingDelete.id })
                  : t("processes.deleteDescriptionStopped", { name: pendingDelete.name, id: pendingDelete.id });
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={confirmDelete}
            >
              {t("common.delete")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Stop confirmation. Triggered from the row action button or the
          context menu (both call requestStop). Stopping keeps the record. */}
      <AlertDialog
        open={pendingStop != null}
        onOpenChange={(open) => {
          if (!open) setPendingStop(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("processes.stopQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStop &&
                t("processes.stopDescription", { name: pendingStop.name, id: pendingStop.id })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={confirmStop}
            >
              {t("common.stop")}
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
