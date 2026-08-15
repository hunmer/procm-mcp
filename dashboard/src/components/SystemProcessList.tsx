import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { InboxIcon } from "lucide-react";
import { Spinner } from "@/registry/default/ui/spinner";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import {
  findProcessByPort,
  killSystemProcess,
  listSystemProcesses,
  revealPath,
} from "@/lib/api";
import type { SystemProcess } from "@/lib/types";
import {
  INTERVAL_KEY,
  LIVE_KEY,
  PORTS_ONLY_KEY,
  type ProcessRow,
  type RowActions,
} from "./system-process/types";
import {
  compareProcessRows,
  exePathOfRow,
  groupProcesses,
  normalizeSystemProcess,
  readBool,
  readNum,
  rowOfProcess,
  writeBool,
  writeNum,
} from "./system-process/utils";
import { useSystemProcessColumns } from "./system-process/useSystemProcessColumns";
import { SystemProcessFilterBar } from "./system-process/SystemProcessFilterBar";
import { SystemProcessTableView } from "./system-process/SystemProcessTableView";
import { SystemProcessInfoPanel } from "./system-process/SystemProcessInfoPanel";
import {
  KillConfirmDialog,
  PortLookupDialog,
  ProcessInfoDialog,
} from "./system-process/SystemProcessDialogs";

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
  // by name" (see compareProcessRows), applied below in sortedData. The
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
  // find-process on the backend and shows the owning process inline.
  const [portLookupOpen, setPortLookupOpen] = useState(false);
  const [portInput, setPortInput] = useState("");
  const [portLookingUp, setPortLookingUp] = useState(false);
  // The process found by the last lookup (null = none/missed) — rendered
  // inline in the dialog with a Kill action in its footer.
  const [portLookupResult, setPortLookupResult] = useState<ProcessRow | null>(
    null,
  );

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
  // with a ×N badge. See groupProcesses.
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

  const columns = useSystemProcessColumns({
    killingPid,
    onKill: setPendingKill,
  });

  const table = useReactTable({
    data: sortedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // NOTE: no getSortedRowModel — sorting is applied in sortedData above so the
    // "ports first" primary key is always honored (see compareProcessRows).
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

  // Look up the owner of a port via find-process (backend). On a hit, keep
  // the lookup dialog open and show the owning process inline (its footer
  // gains a Kill button); otherwise toast that nothing is listening there.
  // `port` is explicit so quick-pick chips can search without racing the
  // controlled input state.
  const handlePortLookup = useCallback(
    async (port: number, e?: React.FormEvent) => {
      e?.preventDefault();
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        onToast(t("system.invalidPortToast"), true);
        return;
      }
      setPortLookingUp(true);
      setPortLookupResult(null);
      try {
        const found = await findProcessByPort(port);
        if (found.length === 0) {
          onToast(t("system.portNotFoundToast", { port }), true);
          return;
        }
        setPortLookupResult(rowOfProcess(found[0]));
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
    [onToast, t],
  );

  // Close the lookup dialog and clear its transient state. Used both by the
  // Dialog's onOpenChange and the footer Kill button (which then arms the
  // shared kill confirmation) so a reopen never shows a stale result.
  const closePortLookup = useCallback(() => {
    setPortLookupOpen(false);
    setPortInput("");
    setPortLookupResult(null);
  }, []);

  const rowCount = table.getRowCount();

  // Per-row callbacks handed to the table view and the shared context menu.
  const rowActions: RowActions = {
    onSelect: setSelected,
    onView: setViewing,
    onReveal: handleReveal,
    onKill: setPendingKill,
  };

  return (
    <div className="flex h-full min-h-0">
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <SystemProcessFilterBar
        shown={rowCount}
        total={rows.length}
        nameFilter={nameFilter}
        onNameFilterChange={setNameFilter}
        pathFilter={pathFilter}
        onPathFilterChange={setPathFilter}
        cmdFilter={cmdFilter}
        onCmdFilterChange={setCmdFilter}
        portsOnly={portsOnly}
        onPortsOnlyChange={setPortsOnly}
        liveRefresh={liveRefresh}
        onLiveRefreshChange={setLiveRefresh}
        intervalMs={intervalMs}
        onIntervalMsChange={setIntervalMs}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onOpenPortLookup={() => setPortLookupOpen(true)}
      />

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
        <SystemProcessTableView
          table={table}
          columns={columns}
          selectedKey={selected?.key ?? null}
          hasData={processes.length > 0}
          actions={rowActions}
        />
      )}
    </div>

      {selected && (
        <SystemProcessInfoPanel
          row={selected}
          onClose={() => setSelected(null)}
          onCopy={handleCopy}
        />
      )}

      <KillConfirmDialog
        pendingKill={pendingKill}
        onDismiss={() => setPendingKill(null)}
        onConfirm={(row) => void confirmKill(row)}
      />
      <ProcessInfoDialog
        viewing={viewing}
        onDismiss={() => setViewing(null)}
        onCopy={handleCopy}
      />
      <PortLookupDialog
        open={portLookupOpen}
        onOpenChange={(o) => (o ? setPortLookupOpen(true) : closePortLookup())}
        portInput={portInput}
        onPortInputChange={setPortInput}
        lookingUp={portLookingUp}
        knownPorts={knownPorts}
        result={portLookupResult}
        onLookup={handlePortLookup}
        onCopy={handleCopy}
        onKill={(row) => {
          closePortLookup();
          setPendingKill(row);
        }}
      />
    </div>
  );
}
