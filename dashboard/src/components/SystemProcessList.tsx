import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  type ColumnDef,
  type Column,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  EyeIcon,
  FolderOpenIcon,
  InboxIcon,
  RefreshCwIcon,
  SearchIcon,
  SkullIcon,
} from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import { Badge } from "@/registry/default/ui/badge";
import { Input } from "@/registry/default/ui/input";
import { Switch } from "@/registry/default/ui/switch";
import { Spinner } from "@/registry/default/ui/spinner";
import {
  Select,
  SelectItem,
  SelectItemText,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/registry/default/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/registry/default/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/registry/default/ui/pagination";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/registry/default/ui/context-menu";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/registry/default/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/registry/default/ui/dialog";
import {
  killSystemProcess,
  listSystemProcesses,
  revealPath,
} from "@/lib/api";
import type { SystemProcess } from "@/lib/types";

// localStorage keys for the two persisted preferences (mirrors the useTheme /
// view-mode best-effort pattern; storage may be unavailable in private mode).
const LIVE_KEY = "procm.sysLive";
const INTERVAL_KEY = "procm.sysInterval";
const SYS_PAGE_SIZE = 25;

const INTERVAL_OPTIONS = [1000, 2000, 3000, 5000] as const;

// Refresh-interval select labels: render "Ns" for each option.
function intervalLabel(ms: number): string {
  return `${ms / 1000}s`;
}

export function SystemProcessList({
  onToast,
}: {
  onToast: (message: string, isError?: boolean) => void;
}) {
  const { t } = useTranslation();
  const [processes, setProcesses] = useState<SystemProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time refresh: when on, the backend is polled on `intervalMs`. Off by
  // default — enumerating host processes shells out (PowerShell on Windows), so
  // it's opt-in rather than hammering the OS on every dashboard open.
  const [liveRefresh, setLiveRefresh] = useState<boolean>(() =>
    readBool(LIVE_KEY, false),
  );
  const [intervalMs, setIntervalMs] = useState<number>(() =>
    readNum(INTERVAL_KEY, 2000),
  );

  // The three independent filters. Each is a plain substring (case-insensitive)
  // applied client-side to the relevant field of the last fetched snapshot, so
  // typing never round-trips to the backend.
  const [nameFilter, setNameFilter] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [cmdFilter, setCmdFilter] = useState("");

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: SYS_PAGE_SIZE,
  });
  // Default to newest-first by PID (higher PID ≈ more recently started).
  const [sorting, setSorting] = useState<SortingState>([
    { id: "pid", desc: true },
  ]);

  // The process awaiting kill confirmation (null = dialog closed). The button
  // itself doesn't kill directly — it arms this, and the dialog's confirm
  // performs the destructive call so a misclick can be backed out of.
  const [pendingKill, setPendingKill] = useState<SystemProcess | null>(null);
  // PID whose tree is currently being killed, to show a per-row pending state.
  const [killingPid, setKillingPid] = useState<number | null>(null);
  // The process shown in the read-only "view info" dialog (null = closed).
  const [viewing, setViewing] = useState<SystemProcess | null>(null);

  // Non-overlapping fetch guard: a slow PowerShell run shouldn't stack on top
  // of the next interval tick. Kept in a ref so the polling effect (registered
  // once) always sees the latest without re-subscribing.
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    // `loading` (initial) drives the full-screen spinner; `refreshing` flips
    // for every fetch to spin the manual-refresh icon. Stable identity (empty
    // deps) so the polling effect below doesn't re-arm on every data change.
    setRefreshing(true);
    try {
      const res = await listSystemProcesses();
      setProcesses(res.processes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Polling: only while live refresh is on. Re-arms whenever the interval or
  // toggle changes; cleaned up on unmount so the tab closing stops the timer.
  useEffect(() => {
    if (!liveRefresh) return;
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [liveRefresh, intervalMs, refresh]);

  // Persist the two preferences (best-effort).
  useEffect(() => {
    writeBool(LIVE_KEY, liveRefresh);
  }, [liveRefresh]);
  useEffect(() => {
    writeNum(INTERVAL_KEY, intervalMs);
  }, [intervalMs]);

  // Drop a pending-kill target if it disappears from the snapshot (e.g. it was
  // killed elsewhere) so the dialog doesn't act on a stale pid.
  useEffect(() => {
    if (pendingKill && !processes.some((p) => p.pid === pendingKill.pid)) {
      setPendingKill(null);
    }
  }, [processes, pendingKill]);

  // Apply the three filters to the latest snapshot. Each matches its own field;
  // an empty filter is a no-op. `exe` falls back to `cmd` on platforms where
  // the executable path isn't exposed separately (non-Windows).
  const filteredData = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    const path = pathFilter.trim().toLowerCase();
    const cmd = cmdFilter.trim().toLowerCase();
    if (!name && !path && !cmd) return processes;
    return processes.filter((p) => {
      if (name && !p.name.toLowerCase().includes(name)) return false;
      if (path) {
        const hay = (p.exe ?? p.cmd ?? "").toLowerCase();
        if (!hay.includes(path)) return false;
      }
      if (cmd) {
        const hay = (p.cmd ?? "").toLowerCase();
        if (!hay.includes(cmd)) return false;
      }
      return true;
    });
  }, [processes, nameFilter, pathFilter, cmdFilter]);

  const columns = useMemo<ColumnDef<SystemProcess>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colName")} />
        ),
        cell: ({ row }) => {
          const p = row.original;
          return (
            <span className="font-medium" title={p.cmd ?? p.name}>
              {p.name}
            </span>
          );
        },
      },
      {
        accessorKey: "pid",
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colPid")} />
        ),
        cell: ({ row }) => (
          <span className="text-foreground/80 font-mono text-xs tabular-nums">
            {row.original.pid}
          </span>
        ),
      },
      {
        accessorKey: "ppid",
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colPpid")} />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {row.original.ppid}
          </span>
        ),
      },
      {
        id: "path",
        accessorFn: (p) => p.exe ?? "",
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colPath")} />
        ),
        cell: ({ row }) => {
          const exe = row.original.exe;
          return exe ? (
            <span
              className="text-muted-foreground block max-w-[280px] truncate font-mono text-xs"
              title={exe}
            >
              {exe}
            </span>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          );
        },
      },
      {
        id: "command",
        accessorFn: (p) => p.cmd ?? "",
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colCommand")} />
        ),
        cell: ({ row }) => {
          const cmd = row.original.cmd;
          return cmd ? (
            <span
              className="text-muted-foreground block max-w-[360px] truncate font-mono text-xs"
              title={cmd}
            >
              {cmd}
            </span>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          );
        },
      },
      {
        id: "actions",
        // Pinned right; not sortable.
        enableSorting: false,
        header: () => <span className="sr-only">{t("system.colActions")}</span>,
        cell: ({ row }) => {
          const p = row.original;
          // The backend refuses protected pids (idle/system/self); disable the
          // obvious kernel slots client-side so they read as non-actionable.
          const protectedPid = p.pid <= 4;
          const isKilling = killingPid === p.pid;
          return (
            <div className="flex justify-end">
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={protectedPid || isKilling}
                aria-label={t("system.killAria", { name: p.name, pid: p.pid })}
                title={
                  protectedPid ? t("system.protectedTitle") : t("system.killTitle")
                }
                className="text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingKill(p);
                }}
              >
                {isKilling ? <Spinner className="size-3.5" /> : <SkullIcon />}
              </Button>
            </div>
          );
        },
      },
    ],
    [t, killingPid],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    autoResetPageIndex: false,
    // Pin name left + actions right so both survive horizontal scroll, matching
    // the Processes table convention (pinnedColAttrs reads these back).
    initialState: {
      columnPinning: { left: ["name"], right: ["actions"] },
    },
    state: { pagination, sorting },
  });

  // Perform the kill: call the backend (tree-kill), toast the result, then
  // refresh immediately so the row (and its children) disappear without waiting
  // for the next poll.
  const confirmKill = useCallback(
    async (p: SystemProcess) => {
      setPendingKill(null);
      setKillingPid(p.pid);
      try {
        await killSystemProcess(p.pid);
        onToast(t("system.killedToast", { name: p.name, pid: p.pid }));
        await refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        onToast(
          t("system.killFailedToast", { name: p.name, error: msg }),
          true,
        );
      } finally {
        setKillingPid(null);
      }
    },
    [onToast, refresh, t],
  );

  // Reveal the process's executable in the OS file manager (selected). Falls
  // back to parsing the executable out of the command line when no separate
  // exe path is exposed (non-Windows). No-op toast when neither is available.
  const handleReveal = useCallback(
    async (p: SystemProcess) => {
      const target = exePathOf(p);
      if (!target) {
        onToast(t("system.noLocationToast", { name: p.name }), true);
        return;
      }
      try {
        await revealPath(target);
      } catch (e) {
        onToast(
          t("system.revealFailedToast", {
            name: p.name,
            error: e instanceof Error ? e.message : String(e),
          }),
          true,
        );
      }
    },
    [onToast, t],
  );

  // Copy a value to the clipboard with a toast; used by the info dialog's
  // per-field copy buttons.
  const handleCopy = useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        onToast(t("system.copiedToast", { label }));
      } catch {
        onToast(t("system.copyFailedToast"), true);
      }
    },
    [onToast, t],
  );

  const rowCount = table.getRowCount();
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = pagination;
  const rangeStart = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min((pageIndex + 1) * pageSize, rowCount);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Filter + refresh bar. Three independent substring filters, a manual
          refresh button, and the live-refresh toggle with its interval. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <FilterInput
          value={nameFilter}
          onChange={setNameFilter}
          placeholder={t("system.filterName")}
          icon={<SearchIcon className="text-foreground/50 pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2" />}
        />
        <FilterInput
          value={pathFilter}
          onChange={setPathFilter}
          placeholder={t("system.filterPath")}
          icon={<SearchIcon className="text-foreground/50 pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2" />}
        />
        <FilterInput
          value={cmdFilter}
          onChange={setCmdFilter}
          placeholder={t("system.filterCmd")}
          icon={<SearchIcon className="text-foreground/50 pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2" />}
        />

        <span className="text-muted-foreground whitespace-nowrap text-xs">
          {t("system.countOfTotal", { shown: rowCount, total: processes.length })}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {/* Live refresh toggle + interval. The interval select is only
              relevant while polling, so it's disabled when the switch is off. */}
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
              <Switch
                checked={liveRefresh}
                onCheckedChange={(v) => setLiveRefresh(v)}
                aria-label={t("system.liveRefresh")}
              />
              {t("system.liveRefresh")}
            </label>
            <Select
              value={String(intervalMs)}
              onValueChange={(v) =>
                setIntervalMs(Number(v) || 2000)
              }
              disabled={!liveRefresh}
            >
              <SelectTrigger size="sm" className="h-8 w-[68px]">
                <SelectValue>{intervalLabel(intervalMs)}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {INTERVAL_OPTIONS.map((ms) => (
                  <SelectItem key={ms} value={String(ms)}>
                    <SelectItemText>{intervalLabel(ms)}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={t("system.refreshNow")}
            title={t("system.refreshNow")}
            onClick={() => void refresh()}
          >
            <RefreshCwIcon className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
          </Button>
        </div>
      </div>

      {/* Body: first-load spinner, error, or the table. */}
      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Spinner className="text-muted-foreground size-5" />
        </div>
      ) : error ? (
        <Empty className="min-h-0 flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>{t("system.errorTitle")}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
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
                  return (
                    <ContextMenu key={row.id}>
                      {/* Right-click opens the context menu (View info / Open
                          location / Kill). Render as the row itself, matching
                          the Processes table's trigger pattern. */}
                      <ContextMenuTrigger
                        render={
                          <TableRow
                            className="group"
                            title={t("system.rowHint", {
                              name: p.name,
                              pid: p.pid,
                            })}
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
                      <SystemProcessContextMenu
                        p={p}
                        onView={setViewing}
                        onReveal={handleReveal}
                        onKill={setPendingKill}
                      />
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
                            ? t("system.empty")
                            : t("system.emptyFiltered")}
                        </EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination footer: range + prev/next. Mirrors the Processes table. */}
      {rowCount > 0 && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2.5">
          <span className="text-muted-foreground whitespace-nowrap text-xs">
            {t("system.paginationViewing", {
              start: rangeStart,
              end: rangeEnd,
              total: rowCount,
            })}
            {pageCount > 1 &&
              t("system.paginationPage", {
                page: pageIndex + 1,
                pages: pageCount,
              })}
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={t("system.previousPage")}
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
                  aria-label={t("system.nextPage")}
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

      {/* Kill confirmation. Killing a tree is irreversible and takes down
          children too, so confirm with the pid + name up front. */}
      <AlertDialog
        open={pendingKill != null}
        onOpenChange={(o) => !o && setPendingKill(null)}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("system.killConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingKill &&
                t("system.killConfirmDescription", {
                  name: pendingKill.name,
                  pid: pendingKill.pid,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={() => pendingKill && void confirmKill(pendingKill)}
            >
              {t("system.kill")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Read-only process info dialog (the "View info" action). Shows the
          process's identity + full executable path + command line, each long
          field with a copy button. */}
      <Dialog
        open={viewing != null}
        onOpenChange={(o) => !o && setViewing(null)}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{t("system.infoTitle")}</DialogTitle>
            <DialogDescription>
              {viewing
                ? t("system.infoDescription", {
                    name: viewing.name,
                    pid: viewing.pid,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <SystemProcessInfo
              p={viewing}
              onCopy={handleCopy}
            />
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>
              {t("common.close")}
            </DialogClose>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

// A labeled search input with a leading icon. Used for the three filters; the
// icon slot keeps the bar compact while each field stays independently scoped.
function FilterInput({
  value,
  onChange,
  placeholder,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative min-w-[150px] flex-1">
      {icon}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 text-xs"
      />
    </div>
  );
}

// A clickable column header that toggles sort direction via the column's own
// handler and shows the current direction with an icon. Mirrors the shared
// process-list SortableHeader, but typed for SystemProcess rows.
function SortableHeader({
  column,
  label,
}: {
  column: Column<SystemProcess>;
  label: string;
}) {
  const dir = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className="group inline-flex items-center gap-1 whitespace-nowrap"
    >
      {label}
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

// Generic sticky-column styling (the Processes table's pinnedColAttrs is typed
// for ProcessView; this is the SystemProcess equivalent). Pins `name` left and
// `actions` right per the table's columnPinning initialState.
function pinnedColAttrs(
  column: Column<SystemProcess>,
  head: boolean,
): { className?: string; style?: CSSProperties } {
  const side = column.getIsPinned();
  if (!side) return {};
  const edge =
    side === "left" ? "border-r border-border" : "border-l border-border";
  const hover = head
    ? ""
    : "group-hover:bg-[color-mix(in_srgb,var(--background),var(--color-black)_2%)] " +
      "dark:group-hover:bg-[color-mix(in_srgb,var(--background),var(--color-white)_2%)]";
  return {
    style: {
      position: "sticky",
      left: side === "left" ? `${column.getStart("left")}px` : undefined,
      right: side === "right" ? `${column.getAfter("right")}px` : undefined,
      zIndex: head ? 2 : 1,
    },
    className: `bg-background ${edge} ${hover}`.trim() || undefined,
  };
}

// ---- tiny localStorage helpers (best-effort; mirror useTheme.ts pattern) ----

function readBool(key: string, fallback: boolean): boolean {
  if (typeof localStorage === "undefined") return fallback;
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === "1";
}
function writeBool(key: string, value: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
}
function readNum(key: string, fallback: number): number {
  if (typeof localStorage === "undefined") return fallback;
  const v = localStorage.getItem(key);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function writeNum(key: string, value: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

// Resolve the best on-disk executable path for a process: prefer the OS-provided
// `exe`, otherwise parse the executable token out of the command line (it leads
// the args, optionally quoted). Returns null when neither yields a path — used
// to disable "Open process location" and to render the field as empty.
function exePathOf(p: SystemProcess): string | null {
  if (p.exe) return p.exe;
  if (!p.cmd) return null;
  // Match either a leading quoted path ("...") or the first whitespace token.
  const m = p.cmd.match(/^"([^"]+)"|^(\S+)/);
  return m ? m[1] || m[2] || null : null;
}

// The right-click menu shared by the system-process rows: View info (opens the
// read-only dialog), Open process location (reveals the exe), and Kill. The
// location item is disabled when no path is resolvable; Kill is disabled for
// protected kernel pids (the backend refuses them anyway).
function SystemProcessContextMenu({
  p,
  onView,
  onReveal,
  onKill,
}: {
  p: SystemProcess;
  onView: (p: SystemProcess) => void;
  onReveal: (p: SystemProcess) => void;
  onKill: (p: SystemProcess) => void;
}) {
  const { t } = useTranslation();
  const hasLocation = exePathOf(p) != null;
  const protectedPid = p.pid <= 4;
  return (
    <ContextMenuPopup>
      <ContextMenuItem onClick={() => onView(p)}>
        <EyeIcon aria-hidden="true" />
        {t("system.ctxView")}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!hasLocation}
        onClick={() => onReveal(p)}
      >
        <FolderOpenIcon aria-hidden="true" />
        {t("system.ctxOpenLocation")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        disabled={protectedPid}
        onClick={() => onKill(p)}
      >
        <SkullIcon aria-hidden="true" />
        {t("system.ctxKill")}
      </ContextMenuItem>
    </ContextMenuPopup>
  );
}

// The read-only process info body rendered inside the "View info" dialog. A
// definition-list grid of identity fields; the long path + command-line values
// get their own copy button. Protected pids show a badge.
function SystemProcessInfo({
  p,
  onCopy,
}: {
  p: SystemProcess;
  onCopy: (value: string, label: string) => void;
}) {
  const { t } = useTranslation();
  const exe = exePathOf(p);
  const protectedPid = p.pid <= 4;
  return (
    <div className="flex flex-col gap-1 py-1">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
        <InfoRow label={t("system.colName")}>
          <span className="font-medium">{p.name}</span>
          {protectedPid && (
            <Badge variant="outline" size="sm" className="ml-2">
              {t("system.protectedTitle")}
            </Badge>
          )}
        </InfoRow>
        <InfoRow label={t("system.colPid")} mono>
          {String(p.pid)}
        </InfoRow>
        <InfoRow label={t("system.colPpid")} mono>
          {String(p.ppid)}
        </InfoRow>
        <InfoRow label={t("system.colPath")}>
          {exe ? (
            <CopyableText
              value={exe}
              onCopy={() => onCopy(exe, t("system.colPath"))}
              copyLabel={t("system.copyPath")}
            />
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          )}
        </InfoRow>
        <InfoRow label={t("system.colCommand")}>
          {p.cmd ? (
            <CopyableText
              value={p.cmd}
              onCopy={() => onCopy(p.cmd as string, t("system.colCommand"))}
              copyLabel={t("system.copyCommand")}
            />
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          )}
        </InfoRow>
      </dl>
    </div>
  );
}

// A label/value row in the info grid. `mono` renders the value in a monospace
// face (used for numeric PIDs).
function InfoRow({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground pt-0.5 whitespace-nowrap">{label}</dt>
      <dd className={mono ? "font-mono text-xs tabular-nums" : undefined}>
        {children}
      </dd>
    </>
  );
}

// A long, copyable value: monospace, wraps with break-all, with a trailing
// copy icon button so paths/commands can be grabbed verbatim.
function CopyableText({
  value,
  onCopy,
  copyLabel,
}: {
  value: string;
  onCopy: () => void;
  copyLabel: string;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <code className="bg-muted block min-w-0 flex-1 break-all rounded px-2 py-1 font-mono text-xs">
        {value}
      </code>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground shrink-0"
        aria-label={copyLabel}
        title={copyLabel}
        onClick={onCopy}
      >
        <CopyIcon />
      </Button>
    </div>
  );
}
