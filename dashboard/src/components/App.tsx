import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/registry/default/ui/button";
import { Badge } from "@/registry/default/ui/badge";
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsTab,
} from "@/registry/default/ui/tabs";
import {
  ActivityIcon,
  FlaskConicalIcon,
  HistoryIcon,
  ListIcon,
  PanelLeftOpenIcon,
  TrashIcon,
} from "lucide-react";
import { ProcessDetailsDialog } from "./NewProcessDialog";
import { ProcessList } from "./ProcessList";
import { SystemProcessList } from "./SystemProcessList";
import { LogPanel } from "./LogPanel";
import { LogFilesView } from "./LogFilesView";
import { Playground } from "./playground/Playground";
import { Toast } from "./Toast";
import { DevInspector } from "./DevInspector";
import { CreateDropdown } from "./CreateDropdown";
import { SettingsDialog } from "./SettingsDialog";
import { useDashboardSocket } from "@/lib/ws";
import {
  clearAllProcesses,
  clearLogFiles,
  listProcesses,
  openFolder,
  setProcessFavorite,
} from "@/lib/api";
import { readUrlState, writeUrlState } from "@/lib/urlState";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/registry/default/ui/alert-dialog";
import type {
  ProcessListResponse,
  ProcessView,
  WsLogMessage,
} from "@/lib/types";

export function App() {
  const [data, setData] = useState<ProcessListResponse | null>(null);
  // Backend start time (epoch ms) — received via GET /api/processes.
  const [serverStartedAt, setServerStartedAt] = useState<number | null>(null);
  // Ticks every second so the uptime display stays current.
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<ProcessView | null>(null);
  // The log panel collapses/expands independently of which process is selected,
  // so closing it keeps the selection and lets you reopen to the same logs.
  // Initialized from the URL so a refresh/reshare restores the open/closed state.
  const [logCollapsed, setLogCollapsed] = useState(() => readUrlState().collapsed);
  // Process details dialog (read-only view opened from the row context menu).
  const [viewing, setViewing] = useState<ProcessView | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    isError?: boolean;
    key: number;
  } | null>(null);
  // Per-process unread log counters (incremented on live log push, cleared
  // when that process's log panel is open).
  const [unread, setUnread] = useState<Record<string, number>>({});
  // Which list tab is shown: the grouped process list, the OS-level
  // system-process monitor, the on-disk history log files, or the HTTP API
  // playground.
  const [activeTab, setActiveTab] = useState<
    "processes" | "system" | "history" | "playground"
  >("processes");
  const { t } = useTranslation();

  // "Clear all" confirmation dialog — stop + delete every process at once.
  const [clearAllOpen, setClearAllOpen] = useState(false);
  // "Clear logs" confirmation dialog (history tab) — delete every history log
  // file except those of running processes.
  const [clearLogsOpen, setClearLogsOpen] = useState(false);
  // Bumped after a bulk log clear so the mounted LogFilesView re-lists.
  const [logFilesReloadKey, setLogFilesReloadKey] = useState(0);

  const { status, reconnectInMs, onLogMessage } = useDashboardSocket();

  // Whether the log panel is currently open (visible + not collapsed) and
  // which process it shows — used to decide whether to count a live log line
  // as unread. Kept in a ref so the log handler (registered once) always sees
  // the latest value without re-subscribing.
  const openLogIdRef = useRef<string | null>(null);
  // Forwarder for live log lines to the active LogPanel. The panel registers
  // its callback here; everything else increments the unread counter.
  const liveLogForwardRef = useRef<((m: WsLogMessage) => void) | null>(null);
  // On first load, a `?proc=` from the URL waits for the WS row to arrive.
  const initialProcRef = useRef<string | null>(readUrlState().procId);

  // Dispatch every live log line: forward to the open panel if it matches,
  // otherwise bump that process's unread badge.
  onLogMessage((m) => {
    if (m.processId === openLogIdRef.current) {
      liveLogForwardRef.current?.(m);
    } else {
      setUnread((cur) => ({ ...cur, [m.processId]: (cur[m.processId] ?? 0) + 1 }));
    }
  });

  // Poll as a fallback for missed WebSocket process updates. Keep requests
  // non-overlapping; a transient failure is retried on the next interval.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const latest = await listProcesses();
        if (cancelled) return;
        setData(latest);
        if (latest.startedAt != null) setServerStartedAt(latest.startedAt);
        setSelected((cur) =>
          cur ? latest.processes.find((p) => p.id === cur.id) ?? null : null,
        );
      } catch {
        // WebSocket status already reports connectivity; retry next interval.
      } finally {
        inFlight = false;
      }
    };

    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Drop the selected process if it no longer exists (e.g. after being stopped).
  useEffect(() => {
    if (selected && data && !data.processes.some((p) => p.id === selected.id)) {
      setSelected(null);
    }
  }, [data, selected]);

  // If the URL's ?proc= doesn't resolve after the first data arrives (stale or
  // unknown id), clear it so the bar doesn't show a dangling reference.
  useEffect(() => {
    if (data && initialProcRef.current && data.processes.length > 0) {
      const id = initialProcRef.current;
      if (!data.processes.some((p) => p.id === id)) {
        initialProcRef.current = null;
        writeUrlState({ procId: null });
      }
    }
  }, [data]);

  // Tick once per second so the uptime display updates live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Keep the document title in sync with the active language.
  useEffect(() => {
    document.title = t("app.title");
  }, [t]);

  // Format the backend's uptime as e.g. "1h 02m 03s" / "02m 03s" / "03s".
  const uptime =
    serverStartedAt != null ? formatUptime(Math.max(0, now - serverStartedAt)) : null;

  // Track which process's logs are currently visible so unread counting is
  // suspended for it, and clear its unread badge on open.
  const openLogFor = useCallback((p: ProcessView | null) => {
    setSelected(p);
    setLogCollapsed(false);
    openLogIdRef.current = p?.id ?? null;
    if (p) setUnread((cur) => (cur[p.id] ? { ...cur, [p.id]: 0 } : cur));
  }, []);

  // Keep openLogIdRef in sync when the panel collapses/expands, selection
  // changes, or the user switches tabs. The log panel only renders on the
  // 进程 tab, so on other tabs it is effectively closed and live logs for the
  // selected process must count as unread instead of being swallowed.
  useEffect(() => {
    const open = activeTab === "processes" && !!selected && !logCollapsed;
    openLogIdRef.current = open && selected ? selected.id : null;
    if (open && selected) {
      setUnread((cur) => (cur[selected.id] ? { ...cur, [selected.id] : 0 } : cur));
    }
  }, [selected, logCollapsed, activeTab]);

  // Reflect the current selection + collapse state into the URL so links and
  // refreshes restore the same view. replaceState keeps the history stack clean.
  useEffect(() => {
    writeUrlState({ procId: selected?.id ?? null, collapsed: logCollapsed });
  }, [selected, logCollapsed]);

  const showToast = useCallback(
    (message: string, isError?: boolean) =>
      setToast({ message, isError, key: Date.now() }),
    [],
  );

  // Star on a process row updates the persisted backend field.
  const handleToggleFavorite = useCallback(
    async (p: ProcessView) => {
      const favorite = !p.favorite;
      try {
        const updated = await setProcessFavorite(p.id, favorite);
        setData((cur) => cur ? {
          ...cur,
          processes: cur.processes.map((row) => row.id === p.id ? updated : row),
        } : cur);
        showToast(t(favorite ? "toasts.addedToFavorites" : "toasts.removedFromFavorites", { name: p.name }));
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), true);
      }
    },
    [showToast, t],
  );

  // Open a group's folder in the OS file manager via the backend (the browser
  // can't do this directly). The group label is an absolute path here.
  async function handleOpenFolder(path: string) {
    try {
      await openFolder(path);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), true);
    }
  }


  // Stop + delete every process at once. Goes through the bulk endpoint so the
  // backend kills + erases them in a single pass each — fanning out per-id
  // DELETEs races in the store and resurrects rows. The selection is dropped
  // immediately so the log panel doesn't linger on a process we're erasing.
  async function handleClearAll() {
    const snapshot = processes;
    setClearAllOpen(false);
    if (snapshot.length === 0) return;
    setSelected(null);
    try {
      const { deleted, notFound } = await clearAllProcesses(
        snapshot.map((p) => p.id),
      );
      if (notFound.length === 0) {
        showToast(t("toasts.cleared", { count: deleted.length }));
      } else {
        showToast(t("toasts.clearedPartial", { deleted: deleted.length, notFound: notFound.length }), true);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  const processes = data?.processes ?? [];

  // Delete every history log file except those of running processes (skipped
  // server-side because they're still being written). Bump the reload key so
  // the mounted LogFilesView re-lists its files.
  async function handleClearLogs() {
    setClearLogsOpen(false);
    try {
      const { deleted, skipped } = await clearLogFiles();
      setLogFilesReloadKey((k) => k + 1);
      if (deleted.length === 0 && skipped.length === 0) {
        showToast(t("toasts.noLogFilesCleared"));
      } else if (skipped.length > 0) {
        showToast(
          t("toasts.logFilesClearedPartial", {
            deleted: deleted.length,
            skipped: skipped.length,
          }),
        );
      } else {
        showToast(t("toasts.logFilesCleared", { count: deleted.length }));
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  // Live (non-stopped, running) processes — shown as a badge in the header.
  const runningCount = processes.filter(
    (p) => p.stoppedAt == null && p.status === "running",
  ).length;

  const statusMeta =
    status === "open"
      ? t("header.statusConnected")
      : status === "connecting"
        ? t("header.statusConnecting")
        : reconnectInMs != null
          ? t("header.statusReconnectingIn", { n: Math.ceil(reconnectInMs / 1000) })
          : t("header.statusReconnecting");

  return (
    <div className="flex h-full">
      {/* Left rail: WS status dot on top, icon-only actions pinned to the
          bottom. The text details (connection state, uptime) live in the dot's
          title. */}
      <div className="bg-card flex w-[60px] shrink-0 flex-col items-center border-r py-3">
        <span
          className={
            "mt-1 inline-block size-2.5 shrink-0 rounded-full " +
            (status === "open"
              ? "bg-green-500"
              : status === "connecting"
                ? "bg-yellow-500"
                : "bg-red-500")
          }
          title={`${statusMeta}${uptime ? ` · ${uptime}` : ""}`}
          aria-label={statusMeta}
        />
        <div className="mt-auto flex flex-col items-center gap-2">
          <CreateDropdown
            onStarted={(id) => showToast(t("toasts.started", { id }))}
            onError={(m) => showToast(m, true)}
            onToast={showToast}
          />
          <SettingsDialog processes={processes} onToast={showToast} />
        </div>
      </div>

      {/* The log panel lives inside the 进程 (Processes) tab as a right column
          next to the process list, so it only takes up space on that tab. */}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-5">
          <div className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
              {/* Tabs double as the section title. */}
              <Tabs
                value={activeTab}
                onValueChange={(v) =>
                  setActiveTab(
                    v === "system"
                      ? "system"
                      : v === "history"
                        ? "history"
                        : v === "playground"
                          ? "playground"
                          : "processes",
                  )
                }
              >
                <TabsList className="relative">
                  <TabsTab value="processes">
                    <ListIcon className="size-3.5" />
                    {t("header.tabProcesses")}
                    {processes.length > 0 && (
                      <span className="text-muted-foreground text-xs">
                        ({processes.length})
                      </span>
                    )}
                  </TabsTab>
                  <TabsTab value="history">
                    <HistoryIcon className="size-3.5" />
                    {t("header.tabHistory")}
                  </TabsTab>
                  <TabsTab value="system">
                    <ActivityIcon className="size-3.5" />
                    {t("header.tabSystem")}
                  </TabsTab>
                  <TabsTab value="playground">
                    <FlaskConicalIcon className="size-3.5" />
                    {t("header.tabPlayground")}
                  </TabsTab>

                  <TabsIndicator />
                </TabsList>
              </Tabs>
              <div className="ml-auto flex items-center gap-2">
                {activeTab === "processes" && runningCount > 0 && (
                  <Badge variant="success" className="gap-1.5">
                    <span className="inline-block size-1.5 rounded-full bg-current" />
                    {t("header.running", { count: runningCount })}
                  </Badge>
                )}
                {activeTab === "processes" && processes.length > 0 && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("header.clearAllTitle")}
                    title={t("header.clearAllTitle")}
                    onClick={() => setClearAllOpen(true)}
                  >
                    <TrashIcon />
                  </Button>
                )}
                {activeTab === "history" && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("header.clearLogsTitle")}
                    title={t("header.clearLogsTitle")}
                    onClick={() => setClearLogsOpen(true)}
                  >
                    <TrashIcon />
                  </Button>
                )}
              </div>
            </div>
            {activeTab === "processes" ? (
              <div className="flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col">
                  <ProcessList
                    processes={processes}
                    selectedId={selected?.id ?? null}
                    unread={unread}
                    onToggleFavorite={handleToggleFavorite}
                    onSelectLogs={openLogFor}
                    onView={(p) => {
                      setViewing(p);
                      setDetailsOpen(true);
                    }}
                    onToast={showToast}
                    onOpenFolder={handleOpenFolder}
                  />
                </div>
                {selected && !logCollapsed && (
                  <div className="w-full max-w-[min(640px,46vw)] shrink-0 border-l">
                    <LogPanel
                      process={selected}
                      onClose={() => setLogCollapsed(true)}
                      onLiveLog={(cb) => {
                        liveLogForwardRef.current = cb;
                      }}
                      onToast={showToast}
                    />
                  </div>
                )}
              </div>
            ) : activeTab === "system" ? (
              <SystemProcessList onToast={showToast} />
            ) : activeTab === "playground" ? (
              <Playground />
            ) : (
              <LogFilesView reloadKey={logFilesReloadKey} />
            )}
          </div>
        </main>
      </div>

      {/* When the log panel is collapsed but a process is selected, show a
          slim rail to reopen it, instead of losing the selection entirely.
          Only on the 进程 tab — that's where the panel lives. */}
      {activeTab === "processes" && selected && logCollapsed && (
        <button
          type="button"
          onClick={() => setLogCollapsed(false)}
          className="bg-card hover:bg-accent fixed right-0 top-1/2 z-20 -translate-y-1/2 rounded-l-lg border-y border-l py-3 pl-1.5 pr-1 text-muted-foreground shadow-lg"
          title={t("header.showLogs", { name: selected.name })}
          aria-label={t("header.showLogsFor", { name: selected.name })}
        >
          <PanelLeftOpenIcon className="size-4" />
        </button>
      )}

      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          isError={toast.isError}
          onDismiss={() => setToast(null)}
        />
      )}

      <ProcessDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        viewProcess={viewing}
        onToast={showToast}
      />

      {/* Clear-all confirmation: stop + delete every process at once. The
          count is read from the current list; deleting is irreversible. */}
      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("header.clearAllQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("header.clearAllDescription", { count: processes.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={handleClearAll}
            >
              {t("header.clearAll")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Clear-logs confirmation (history tab): delete every on-disk log file
          except those of running processes — the backend skips those. */}
      <AlertDialog open={clearLogsOpen} onOpenChange={setClearLogsOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("header.clearLogsQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("header.clearLogsDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={handleClearLogs}
            >
              {t("header.clearLogs")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Dev-only: render nothing in production. Lets you click a component in
          the browser to open its source in your editor. */}
      <DevInspector />
    </div>
  );
}

// Format a duration (ms) as a compact uptime string. Shows hours only when
// present, always zero-padded minutes/seconds: "1h 02m 03s" / "02m 03s" / "03s".
function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}h ${mm}m ${ss}s` : `${mm}m ${ss}s`;
}
