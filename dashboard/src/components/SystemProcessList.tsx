import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  type ColumnDef,
  type Column,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  EyeIcon,
  FolderOpenIcon,
  GlobeIcon,
  InboxIcon,
  NetworkIcon,
  RefreshCwIcon,
  SearchIcon,
  SkullIcon,
  XIcon,
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
  findProcessByPort,
  killSystemProcess,
  listSystemProcesses,
  revealPath,
} from "@/lib/api";
import type { SystemProcess } from "@/lib/types";

// localStorage keys for the persisted preferences (mirrors the useTheme /
// view-mode best-effort pattern; storage may be unavailable in private mode).
const LIVE_KEY = "procm.sysLive";
const INTERVAL_KEY = "procm.sysInterval";
const PORTS_ONLY_KEY = "procm.sysPortsOnly";

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

  // "HTTP ports only" view: restrict the table to processes listening on at
  // least one TCP port (the typical dev-server case — the port badges link to
  // http://localhost:<port>). Like the text filters it's client-side over the
  // last snapshot, and persisted so the preference survives reloads.
  const [portsOnly, setPortsOnly] = useState<boolean>(() =>
    readBool(PORTS_ONLY_KEY, false),
  );

  // No default column sort: the natural order is "listening ports first, then
  // by name" (see compareSystemProcesses), applied below in sortedData. The
  // sorting state here is only what the user explicitly selects via headers.
  const [sorting, setSorting] = useState<SortingState>([]);

  // The row awaiting kill confirmation (null = dialog closed). The button
  // itself doesn't kill directly — it arms this, and the dialog's confirm
  // performs the destructive call so a misclick can be backed out of.
  const [pendingKill, setPendingKill] = useState<ProcessRow | null>(null);
  // PID whose tree is currently being killed, to show a per-row pending state
  // (the representative pid of the row being killed).
  const [killingPid, setKillingPid] = useState<number | null>(null);
  // The row shown in the read-only "view info" dialog (null = closed).
  const [viewing, setViewing] = useState<ProcessRow | null>(null);
  // The row selected for the inline right-hand info panel. Clicking a row
  // sets this; the panel reuses the same SystemProcessInfo body as the dialog.
  const [selected, setSelected] = useState<ProcessRow | null>(null);
  // Toolbar "view port" lookup: a dialog with a port input that runs
  // find-process on the backend and opens the info dialog for the owner.
  const [portLookupOpen, setPortLookupOpen] = useState(false);
  const [portInput, setPortInput] = useState("");
  const [portLookingUp, setPortLookingUp] = useState(false);

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
      setProcesses(res.processes.map(normalizeSystemProcess));
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

  // Persist the preferences (best-effort).
  useEffect(() => {
    writeBool(LIVE_KEY, liveRefresh);
  }, [liveRefresh]);
  useEffect(() => {
    writeNum(INTERVAL_KEY, intervalMs);
  }, [intervalMs]);
  useEffect(() => {
    writeBool(PORTS_ONLY_KEY, portsOnly);
  }, [portsOnly]);

  // Collapse the snapshot into display rows: processes sharing the same name
  // AND the same parent (e.g. a browser's helper swarm) merge into one row
  // with a ×N badge. See groupProcesses below.
  const rows = useMemo(() => groupProcesses(processes), [processes]);

  // Drop a pending-kill target if its row disappears from the snapshot (e.g.
  // it was killed elsewhere) so the dialog doesn't act on a stale pid.
  useEffect(() => {
    if (pendingKill && !rows.some((r) => r.key === pendingKill.key)) {
      setPendingKill(null);
    }
  }, [rows, pendingKill]);

  // Keep the right-panel selection live across refreshes: swap in the matching
  // row from the fresh snapshot (so e.g. port badges and the member list
  // update), and clear it if the process has gone away. Reads `cur` inside the
  // updater so it doesn't need `selected` as a dependency.
  useEffect(() => {
    setSelected(
      (cur) => (cur ? rows.find((r) => r.key === cur.key) ?? null : null),
    );
  }, [rows]);

  // Apply the filters to the grouped rows. Each text filter matches its own
  // field (an empty filter is a no-op); path/command match when ANY member
  // matches, so a merged row is never hidden because a sibling's command line
  // differs. The ports-only toggle drops rows with no listening port.
  const filteredData = useMemo(() => {
    const name = nameFilter.trim().toLowerCase();
    const path = pathFilter.trim().toLowerCase();
    const cmd = cmdFilter.trim().toLowerCase();
    if (!name && !path && !cmd && !portsOnly) return rows;
    return rows.filter((r) => {
      if (portsOnly && !r.ports?.length) return false;
      if (name && !r.name.toLowerCase().includes(name)) return false;
      if (path) {
        const hit = r.members.some((m) =>
          (m.exe ?? m.cmd ?? "").toLowerCase().includes(path),
        );
        if (!hit) return false;
      }
      if (cmd) {
        const hit = r.members.some((m) =>
          (m.cmd ?? "").toLowerCase().includes(cmd),
        );
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, nameFilter, pathFilter, cmdFilter, portsOnly]);

  // Stable row order: processes listening on a port ALWAYS come first (so
  // servers stay visible at the top regardless of which column is sorted),
  // then the user's selected column (if any), then by name as a tiebreaker.
  // The table uses getCoreRowModel only (no getSortedRowModel) so this order
  // is authoritative; the sorting state still drives the header indicators.
  const sortedData = useMemo(
    () => [...filteredData].sort((a, b) => compareProcessRows(a, b, sorting)),
    [filteredData, sorting],
  );

  const columns = useMemo<ColumnDef<ProcessRow>[]>(
    () => [
      {
        accessorKey: "name",
        // Fixed width: long names wrap onto multiple lines instead of
        // truncating or squeezing the other columns (applied to the header
        // and cells via colWidthClass below).
        meta: { className: "w-[240px] min-w-[240px] max-w-[240px]" },
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colName")} />
        ),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-baseline gap-1.5">
              <span
                className="font-medium min-w-0 flex-1 break-words"
                title={r.cmd ?? r.name}
              >
                {r.name}
              </span>
              {r.members.length > 1 && (
                <CountBadge count={r.members.length} />
              )}
              {r.ports?.map((port) => (
                <PortBadge key={port} port={port} />
              ))}
            </div>
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
          const r = row.original;
          // The backend refuses protected pids (idle/system/self); disable the
          // obvious kernel slots client-side so they read as non-actionable.
          const protectedPid = r.members.some((m) => m.pid <= 4);
          const isKilling = killingPid === r.pid;
          return (
            <div className="flex justify-end">
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={protectedPid || isKilling}
                aria-label={t("system.killAria", { name: r.name, pid: r.pid })}
                title={
                  protectedPid ? t("system.protectedTitle") : t("system.killTitle")
                }
                className="text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingKill(r);
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
    data: sortedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // NOTE: no getSortedRowModel — sorting is applied in sortedData above so the
    // "ports first" primary key is always honored (see compareSystemProcesses).
    // No pagination model either — all rows render in one scrollable region.
    onSortingChange: setSorting,
    // Pin name left + actions right so both survive horizontal scroll, matching
    // the Processes table convention (pinnedColAttrs reads these back).
    initialState: {
      columnPinning: { left: ["name"], right: ["actions"] },
    },
    state: { sorting },
  });

  // Perform the kill: call the backend (tree-kill) per member — merged rows
  // kill every grouped process, single rows are the one-member case — toast
  // the result, then refresh immediately so the rows disappear without
  // waiting for the next poll.
  const confirmKill = useCallback(
    async (row: ProcessRow) => {
      setPendingKill(null);
      setKillingPid(row.pid);
      try {
        for (const m of row.members) {
          await killSystemProcess(m.pid);
        }
        onToast(
          row.members.length > 1
            ? t("system.killedGroupToast", {
                name: row.name,
                count: row.members.length,
              })
            : t("system.killedToast", { name: row.name, pid: row.pid }),
        );
        await refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        onToast(
          t("system.killFailedToast", { name: row.name, error: msg }),
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
  // exe path is exposed (non-Windows); merged rows take the first member that
  // yields a path. No-op toast when neither is available.
  const handleReveal = useCallback(
    async (row: ProcessRow) => {
      const target = exePathOfRow(row);
      if (!target) {
        onToast(t("system.noLocationToast", { name: row.name }), true);
        return;
      }
      try {
        await revealPath(target);
      } catch (e) {
        onToast(
          t("system.revealFailedToast", {
            name: row.name,
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

  // All distinct listening ports across the current snapshot, sorted. Powers
  // the quick-pick chips in the "view port" lookup dialog.
  const knownPorts = useMemo(() => {
    const set = new Set<number>();
    for (const p of processes) for (const port of p.ports ?? []) set.add(port);
    return [...set].sort((a, b) => a - b);
  }, [processes]);

  // Look up the owner of a port via find-process (backend). On a hit, close the
  // lookup dialog and open the read-only info dialog for the owning process;
  // otherwise toast that nothing is listening there.
  const handlePortLookup = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const port = Number(portInput);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        onToast(t("system.invalidPortToast"), true);
        return;
      }
      setPortLookingUp(true);
      try {
        const found = await findProcessByPort(port);
        if (found.length === 0) {
          onToast(t("system.portNotFoundToast", { port }), true);
          return;
        }
        setPortLookupOpen(false);
        setPortInput("");
        setViewing(rowOfProcess(found[0]));
      } catch (err) {
        onToast(
          t("system.portLookupFailedToast", {
            error: err instanceof Error ? err.message : String(err),
          }),
          true,
        );
      } finally {
        setPortLookingUp(false);
      }
    },
    [portInput, onToast, t],
  );

  const rowCount = table.getRowCount();

  return (
    <div className="flex h-full min-h-0">
    <div className="flex h-full min-w-0 flex-1 flex-col">
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

        {/* Ports-only view: keeps just the processes listening on a TCP port
            (dev servers etc.). Composes with the text filters above. */}
        <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs">
          <Switch
            checked={portsOnly}
            onCheckedChange={(v) => setPortsOnly(v)}
            aria-label={t("system.portsOnly")}
          />
          {t("system.portsOnly")}
        </label>

        <span className="text-muted-foreground whitespace-nowrap text-xs">
          {t("system.countOfTotal", { shown: rowCount, total: rows.length })}
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
            aria-label={t("system.portLookupTitle")}
            title={t("system.portLookupTitle")}
            onClick={() => setPortLookupOpen(true)}
          >
            <NetworkIcon className="size-3.5" />
          </Button>
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
              {table.getRowModel().rows.length ? (
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
                              selected?.key === r.key ? "selected" : undefined
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
                            onClick={() => setSelected(r)}
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
                      <SystemProcessContextMenu
                        row={r}
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
    </div>

      {/* Right-hand info panel. Clicking a row selects it here; the body reuses
          the same SystemProcessInfo as the "view info" dialog so the two stay
          in sync. Closes (deselects) via the × button. */}
      {selected && (
        <aside className="bg-card flex h-full w-[420px] shrink-0 flex-col border-l">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium" title={selected.name}>
                {selected.name}
              </div>
              <div className="text-muted-foreground font-mono text-xs tabular-nums">
                {selected.members.length > 1
                  ? t("system.groupCount", { count: selected.members.length })
                  : `PID ${selected.pid}`}
              </div>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("common.close")}
              title={t("common.close")}
              onClick={() => setSelected(null)}
            >
              <XIcon />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1">
            <SystemProcessInfo row={selected} onCopy={handleCopy} />
          </div>
        </aside>
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
                (pendingKill.members.length > 1
                  ? t("system.killConfirmGroupDescription", {
                      name: pendingKill.name,
                      count: pendingKill.members.length,
                    })
                  : t("system.killConfirmDescription", {
                      name: pendingKill.name,
                      pid: pendingKill.pid,
                    }))}
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
                ? viewing.members.length > 1
                  ? t("system.infoGroupDescription", {
                      name: viewing.name,
                      count: viewing.members.length,
                    })
                  : t("system.infoDescription", {
                      name: viewing.name,
                      pid: viewing.pid,
                    })
                : ""}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <SystemProcessInfo
              row={viewing}
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

      {/* Toolbar "view port" lookup: enter a port, the backend runs
          find-process, and the owning process opens in the info dialog above.
          Quick-pick chips list ports already seen in the current snapshot. */}
      <Dialog
        open={portLookupOpen}
        onOpenChange={(o) => {
          setPortLookupOpen(o);
          if (!o) setPortInput("");
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{t("system.portLookupTitle")}</DialogTitle>
            <DialogDescription>
              {t("system.portLookupDescription")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex items-center gap-2 p-3"
            onSubmit={(e) => void handlePortLookup(e)}
          >
            <Input
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              inputMode="numeric"
              placeholder={t("system.portPlaceholder")}
              className="h-8"
              autoFocus
            />
            <Button type="submit" size="sm" loading={portLookingUp}>
              {t("system.portFind")}
            </Button>
          </form>
          {knownPorts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-3">
              {knownPorts.slice(0, 24).map((port) => (
                <button
                  key={port}
                  type="button"
                  onClick={() => {
                    setPortInput(String(port));
                    void handlePortLookup();
                  }}
                  className="hover:bg-accent rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-none"
                >
                  {port}
                </button>
              ))}
            </div>
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
  column: Column<ProcessRow>;
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

// Optional per-column width classes, declared on the columnDef's meta and
// applied to both the header and every cell of that column (merged with the
// sticky-pin classes at the render sites). Currently used to give the
// wrapping name column a fixed width.
function colWidthClass(column: Column<ProcessRow>): string | undefined {
  return (column.columnDef.meta as { className?: string } | undefined)
    ?.className;
}

// Generic sticky-column styling (the Processes table's pinnedColAttrs is typed
// for ProcessView; this is the ProcessRow equivalent). Pins `name` left and
// `actions` right per the table's columnPinning initialState.
function pinnedColAttrs(
  column: Column<ProcessRow>,
  head: boolean,
): { className?: string; style?: CSSProperties } {
  const side = column.getIsPinned();
  if (!side) return {};
  const edge =
    side === "left" ? "border-r border-border" : "border-l border-border";
  const hover = head
    ? ""
    : "group-hover:bg-[color-mix(in_srgb,var(--background),var(--color-black)_2%)] " +
      "group-data-[state=selected]:bg-[color-mix(in_srgb,var(--background),var(--color-black)_4%)] " +
      "dark:group-hover:bg-[color-mix(in_srgb,var(--background),var(--color-white)_2%)] " +
      "dark:group-data-[state=selected]:bg-[color-mix(in_srgb,var(--background),var(--color-white)_4%)]";
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

// A display row for the System table: one process, or several merged because
// they share the same name AND parent (e.g. a browser's helper swarm). Shared
// fields come from the first member; the full `members` list powers the ×N
// badge and the info panel's per-member list — within a group only pid and
// command line differ, so those are the two per-member fields shown.
interface ProcessRow {
  // `${name}|${ppid}` — unique per row (the trailing numeric ppid keeps it
  // injective even if a name contains "|") and stable across refreshes, so
  // selection/pending-kill survive regrouping.
  key: string;
  members: SystemProcess[];
  name: string;
  // Representative member (lowest pid) — drives sorting and row identity.
  pid: number;
  ppid: number;
  cmd: string | null;
  exe: string | null;
  // Deduped union of the members' listening ports.
  ports?: number[];
}

// Group a snapshot into display rows. Members are kept pid-ascending so the
// representative is stable, and insertion order preserves the snapshot's
// ordering for the (unsorted) default view.
function groupProcesses(processes: SystemProcess[]): ProcessRow[] {
  const groups = new Map<string, SystemProcess[]>();
  for (const p of processes) {
    const key = `${p.name}|${p.ppid}`;
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }
  const rows: ProcessRow[] = [];
  for (const [key, members] of groups) {
    members.sort((a, b) => a.pid - b.pid);
    const first = members[0];
    const ports = new Set<number>();
    for (const m of members) for (const port of m.ports ?? []) ports.add(port);
    rows.push({
      key,
      members,
      name: first.name,
      pid: first.pid,
      ppid: first.ppid,
      cmd: first.cmd,
      exe: members.find((m) => m.exe)?.exe ?? null,
      ports: [...ports].sort((a, b) => a - b),
    });
  }
  return rows;
}

// Wrap a single process (e.g. a port-lookup hit) as a one-member row so the
// shared info panel/dialog renders it without special cases.
function rowOfProcess(p: SystemProcess): ProcessRow {
  return {
    key: `${p.name}|${p.ppid}`,
    members: [p],
    name: p.name,
    pid: p.pid,
    ppid: p.ppid,
    cmd: p.cmd,
    exe: p.exe,
    ports: p.ports,
  };
}

// Resolve the best on-disk executable path for a row: the first member whose
// `exe` or leading command-line token yields a path (merged rows may mix
// members with and without a resolvable path).
function exePathOfRow(row: ProcessRow): string | null {
  for (const m of row.members) {
    const path = exePathOf(m);
    if (path) return path;
  }
  return null;
}

// Keep the UI compatible with snapshots produced by older backends and with
// JSON values that may arrive as strings. A normalized `ports` array is the
// single source used by both the badge renderer and the port-first comparator.
function normalizeSystemProcess(process: SystemProcess): SystemProcess {
  const raw = process as SystemProcess & { port?: unknown };
  const values = Array.isArray(raw.ports)
    ? raw.ports
    : raw.port == null
      ? []
      : [raw.port];
  const ports = [...new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 65535),
  )].sort((a, b) => a - b);
  return { ...process, ports: ports.length > 0 ? ports : undefined };
}

// The raw comparable value for a sortable column. Numbers compare numerically
// (pid/ppid); text compares case-insensitively.
function sortValue(p: ProcessRow, id: string): number | string {
  switch (id) {
    case "pid":
      return p.pid;
    case "ppid":
      return p.ppid;
    case "name":
      return p.name.toLowerCase();
    case "path":
      return (p.exe ?? "").toLowerCase();
    case "command":
      return (p.cmd ?? "").toLowerCase();
    default:
      return "";
  }
}

// Authoritative row comparator for the System table. Ordering, in priority:
//   1. Rows listening on a port ALWAYS come first (servers stay pinned to
//      the top regardless of the active column sort).
//   2. The user's selected column(s), in sorting-state order (asc/desc).
//   3. Name ascending (case-insensitive, natural numeric order) as a stable
//      tiebreaker — also the whole order when no column is selected.
function compareProcessRows(
  a: ProcessRow,
  b: ProcessRow,
  sorting: SortingState,
): number {
  const aHasPorts = (a.ports?.length ?? 0) > 0;
  const bHasPorts = (b.ports?.length ?? 0) > 0;
  if (aHasPorts !== bHasPorts) return aHasPorts ? -1 : 1;

  for (const s of sorting) {
    const av = sortValue(a, s.id);
    const bv = sortValue(b, s.id);
    let cmp: number;
    if (typeof av === "number" && typeof bv === "number") {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    if (cmp !== 0) return s.desc ? -cmp : cmp;
  }

  return a.name.localeCompare(b.name, undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

// A ×N badge marking a merged row — several processes sharing the same name
// and parent collapsed into one. Purely informational; the member list lives
// in the info panel/dialog.
function CountBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <span
      className="text-muted-foreground inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-none"
      title={t("system.groupBadgeTitle", { count })}
    >
      ×{count}
    </span>
  );
}

// A listening-port badge shown next to a process name. Clicking opens
// http://localhost:<port> in a new tab; stopPropagation keeps the row's
// context-menu trigger from also firing.
function PortBadge({ port }: { port: number }) {
  const { t } = useTranslation();
  return (
    <a
      href={`http://localhost:${port}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="hover:bg-accent inline-flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-none"
      title={t("system.portBadgeTitle", { port })}
    >
      <GlobeIcon className="size-2.5" />
      {port}
    </a>
  );
}

// The right-click menu shared by the system-process rows: View info (opens the
// read-only dialog), Open process location (reveals the exe), and Kill. The
// location item is disabled when no path is resolvable; Kill is disabled for
// protected kernel pids (the backend refuses them anyway).
function SystemProcessContextMenu({
  row,
  onView,
  onReveal,
  onKill,
}: {
  row: ProcessRow;
  onView: (row: ProcessRow) => void;
  onReveal: (row: ProcessRow) => void;
  onKill: (row: ProcessRow) => void;
}) {
  const { t } = useTranslation();
  const hasLocation = exePathOfRow(row) != null;
  const protectedPid = row.members.some((m) => m.pid <= 4);
  return (
    <ContextMenuPopup>
      <ContextMenuItem onClick={() => onView(row)}>
        <EyeIcon aria-hidden="true" />
        {t("system.ctxView")}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!hasLocation}
        onClick={() => onReveal(row)}
      >
        <FolderOpenIcon aria-hidden="true" />
        {t("system.ctxOpenLocation")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        disabled={protectedPid}
        onClick={() => onKill(row)}
      >
        <SkullIcon aria-hidden="true" />
        {t("system.ctxKill")}
      </ContextMenuItem>
    </ContextMenuPopup>
  );
}

// The read-only process info body rendered inside the "View info" dialog and
// the right-hand panel. A definition-list grid of the row's shared identity
// fields (the long path value gets a copy button). Merged rows replace the
// single PID/command entries with a brief per-member list — pid + command
// line, the only fields that differ within a group — kept action-free.
function SystemProcessInfo({
  row,
  onCopy,
}: {
  row: ProcessRow;
  onCopy: (value: string, label: string) => void;
}) {
  const { t } = useTranslation();
  const merged = row.members.length > 1;
  const exe = exePathOfRow(row);
  const protectedPid = row.members.some((m) => m.pid <= 4);
  return (
    <div className="flex flex-col gap-1 py-1 p-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
        <InfoRow label={t("system.colName")}>
          <span className="font-medium">{row.name}</span>
          {protectedPid && (
            <Badge variant="outline" size="sm" className="ml-2">
              {t("system.protectedTitle")}
            </Badge>
          )}
        </InfoRow>
        <InfoRow label={t("system.colPid")} mono={!merged}>
          {merged
            ? t("system.groupCount", { count: row.members.length })
            : String(row.pid)}
        </InfoRow>
        <InfoRow label={t("system.colPpid")} mono>
          {String(row.ppid)}
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
        {!merged && (
          <InfoRow label={t("system.colCommand")}>
            {row.cmd ? (
              <CopyableText
                value={row.cmd}
                onCopy={() => onCopy(row.cmd as string, t("system.colCommand"))}
                copyLabel={t("system.copyCommand")}
              />
            ) : (
              <span className="text-muted-foreground/50 text-xs">—</span>
            )}
          </InfoRow>
        )}
      </dl>
      {merged && (
        <div className="mt-1 flex flex-col gap-1.5 border-t pt-2.5">
          <div className="text-muted-foreground text-xs font-medium">
            {t("system.groupMembers")}
          </div>
          {row.members.map((m) => (
            <div key={m.pid} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                {m.pid}
              </span>
              <span
                className="text-muted-foreground min-w-0 flex-1 truncate font-mono"
                title={m.cmd ?? m.name}
              >
                {m.cmd ?? "—"}
              </span>
              {m.cmd && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground shrink-0"
                  aria-label={t("system.copyCommand")}
                  title={t("system.copyCommand")}
                  onClick={() =>
                    onCopy(m.cmd as string, t("system.colCommand"))
                  }
                >
                  <CopyIcon />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
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
