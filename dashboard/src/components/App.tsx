import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  HistoryIcon,
  LanguagesIcon,
  ListIcon,
  MoonIcon,
  PanelLeftOpenIcon,
  SunIcon,
  TrashIcon,
} from "lucide-react";
import {
  FavoriteDialog,
  NewProcessDialog,
  ProcessDetailsDialog,
} from "./NewProcessDialog";
import { ImportFavoritesDialog } from "./ImportFavoritesDialog";
import { ProcessList } from "./ProcessList";
import { SystemProcessList } from "./SystemProcessList";
import { LogPanel } from "./LogPanel";
import { LogFilesView } from "./LogFilesView";
import { Toast } from "./Toast";
import { DevInspector } from "./DevInspector";
import { useTheme } from "@/lib/useTheme";
import { useLanguage } from "@/lib/useLanguage";
import { LANGUAGES } from "@/i18n";
import { useDashboardSocket } from "@/lib/ws";
import {
  clearAllProcesses,
  listProcesses,
  openFolder,
  startProcess,
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
import {
  favoriteSignature,
  favoriteToStartBody,
  useFavorites,
  type Favorite,
} from "@/lib/favorites";
import type {
  ProcessListResponse,
  ProcessView,
  WsLogMessage,
} from "@/lib/types";

export function App() {
  const [data, setData] = useState<ProcessListResponse | null>(null);
  // Backend start time (epoch ms) — received via WS, used to show uptime.
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
  // Which list tab is shown: the merged process list (live processes grouped
  // together with the favorites they were started from), the OS-level
  // system-process monitor, or the on-disk history log files.
  const [activeTab, setActiveTab] = useState<
    "processes" | "system" | "history"
  >("processes");
  const { theme, toggle } = useTheme();
  const { language, changeLanguage } = useLanguage();
  const { t } = useTranslation();

  // Favorites live entirely client-side (localStorage). They're a saved launch
  // recipe + optional category, decoupled from the backend process records.
  const {
    favorites,
    addFavorite,
    removeFavorite,
    updateFavorite,
  } = useFavorites();

  // The favorite editor dialog opens in one of two modes:
  //   - adding a new favorite seeded from a process (star click on a row), or
  //   - editing an existing favorite (pencil on a card).
  const [favOpen, setFavOpen] = useState(false);
  const [favSeedProcess, setFavSeedProcess] = useState<ProcessView | null>(null);
  const [favSeedFavorite, setFavSeedFavorite] = useState<Favorite | null>(null);
  // "Clear all" confirmation dialog — stop + delete every process at once.
  const [clearAllOpen, setClearAllOpen] = useState(false);
  // Folder import dialog: scan a project dir for commands to save as favorites.
  const [importOpen, setImportOpen] = useState(false);

  const { status, reconnectInMs, onProcessesMessage, onLogMessage } =
    useDashboardSocket();

  // Whether the log panel is currently open (visible + not collapsed) and
  // which process it shows — used to decide whether to count a live log line
  // as unread. Kept in a ref so the log handler (registered once) always sees
  // the latest value without re-subscribing.
  const openLogIdRef = useRef<string | null>(null);
  // Forwarder for live log lines to the active LogPanel. The panel registers
  // its callback here; everything else increments the unread counter.
  const liveLogForwardRef = useRef<((m: WsLogMessage) => void) | null>(null);
  // A process id that should be auto-selected (opening its log panel) as soon
  // as it appears in a WS push. Set when launching a favorite so the panel
  // opens automatically once the backend confirms the new process; cleared
  // after it's consumed. The launch response returns before the WS delivers
  // the row, so we can't select directly.
  const pendingSelectRef = useRef<string | null>(null);
  // On first load, a `?proc=` from the URL seeds the same auto-open path as a
  // favorite launch: wait for the WS push to deliver the row, then open it.
  const initialProcRef = useRef<string | null>(readUrlState().procId);

  // Live updates from the backend: replace the process list and keep the
  // selected log target in sync with the latest view.
  onProcessesMessage((m) => {
    setData({
      serverId: m.serverId ?? data?.serverId ?? "",
      pid: m.pid ?? data?.pid ?? 0,
      processes: m.data,
    });
    if (m.startedAt != null) setServerStartedAt(m.startedAt);
    // If a launch is pending auto-select (e.g. from "Launch" on a favorite),
    // open its log panel as soon as the backend reports it.
    const pending = pendingSelectRef.current;
    if (pending && m.data.some((p) => p.id === pending)) {
      const started = m.data.find((p) => p.id === pending) ?? null;
      pendingSelectRef.current = null;
      if (started) {
        openLogFor(started);
        return;
      }
    }
    // First-load auto-select from a `?proc=` in the URL: same open-on-arrival
    // path as a favorite launch. Consumed once.
    const initial = initialProcRef.current;
    if (initial && m.data.some((p) => p.id === initial)) {
      const found = m.data.find((p) => p.id === initial) ?? null;
      initialProcRef.current = null;
      if (found) {
        openLogFor(found);
        return;
      }
    }
    setSelected((cur) =>
      cur ? m.data.find((p) => p.id === cur.id) ?? null : null,
    );
  });

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
        setSelected((cur) =>
          cur ? latest.processes.find((p) => p.id === cur.id) ?? null : null,
        );
      } catch {
        // WebSocket status already reports connectivity; retry next interval.
      } finally {
        inFlight = false;
      }
    };

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

  // Set of currently-favorited launch signatures, for the row star fill state.
  const favoritedSignatures = useMemo(
    () => new Set(favorites.map((f) => favoriteSignature(f))),
    [favorites],
  );

  // Star on a process row: if already favorited, remove it; otherwise open the
  // favorite dialog seeded from that process so the user can set a category.
  const handleToggleFavorite = useCallback(
    (p: ProcessView) => {
      if (favoritedSignatures.has(favoriteSignature(p))) {
        const sig = favoriteSignature(p);
        const existing = favorites.find((f) => favoriteSignature(f) === sig);
        if (existing) removeFavorite(existing.id);
        showToast(t("toasts.removedFromFavorites", { name: p.name }));
      } else {
        setFavSeedFavorite(null);
        setFavSeedProcess(p);
        setFavOpen(true);
      }
    },
    [favorites, favoritedSignatures, removeFavorite, showToast],
  );

  // Save a brand-new favorite coming out of the dialog. Avoids duplicates by
  // launch signature (the hook de-dupes too, but we toast accordingly).
  function handleCreateFavorite(fav: Favorite) {
    if (favoritedSignatures.has(favoriteSignature(fav))) {
      showToast(t("toasts.alreadyInFavorites", { name: fav.name ?? fav.script }), true);
      return;
    }
    addFavorite(fav);
    showToast(t("toasts.addedToFavorites", { name: fav.name ?? fav.script }));
  }

  function handleEditFavorite(fav: Favorite) {
    updateFavorite(fav);
    showToast(t("toasts.updatedFavorite", { name: fav.name ?? fav.script }));
  }

  function handleRemoveFavorite(id: string) {
    const f = favorites.find((x) => x.id === id);
    removeFavorite(id);
    showToast(t("toasts.removedFavorite", { name: f?.name ?? f?.script ?? "" }));
  }

  // Import a batch of scanned favorites (from the folder-import dialog). Each
  // is added via addFavorite, which de-dupes by launch signature; we tally the
  // skips so the toast reports how many were actually new vs. already saved.
  function handleImportFavorites(favs: Favorite[]) {
    let added = 0;
    for (const fav of favs) {
      if (addFavorite(fav)) added++;
    }
    const skipped = favs.length - added;
    if (skipped === 0) {
      showToast(t("toasts.importedAll", { count: added }));
    } else if (added === 0) {
      showToast(t("toasts.allAlreadyInFavorites", { count: skipped }), true);
    } else {
      showToast(t("toasts.importedSome", { added, skipped }));
    }
  }

  // Open a group's folder in the OS file manager via the backend (the browser
  // can't do this directly). The group label is an absolute path here.
  async function handleOpenFolder(path: string) {
    try {
      await openFolder(path);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  // Delete an entire favorites group by removing each of its favorites. No
  // confirmation: the cards' per-item remove doesn't confirm either, and the
  //action is local/reversible by re-importing from the folder.
  function handleRemoveCategory(ids: string[]) {
    const n = ids.length;
    for (const id of ids) removeFavorite(id);
    if (n > 0) showToast(t("toasts.deletedGroup", { count: n }));
  }

  // Launch a favorite as a real process via the backend. On success, arm
  // `pendingSelectRef` so the log panel auto-opens on this process the moment
  // the WS push delivers its row.
  async function handleLaunchFavorite(fav: Favorite) {
    try {
      const r = await startProcess(favoriteToStartBody(fav));
      pendingSelectRef.current = r.id;
      showToast(t("toasts.started", { id: r.id }));
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  // Open the editor on an existing favorite (from a card's pencil button).
  function handleEditFavoriteCard(fav: Favorite) {
    setFavSeedProcess(null);
    setFavSeedFavorite(fav);
    setFavOpen(true);
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
    <div className="flex h-full flex-col">
      <header className="bg-card sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        {/* Left: live WS connection indicator + server uptime. */}
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground"
            title={statusMeta}
          >
            <span
              className={
                "inline-block size-2 rounded-full " +
                (status === "open"
                  ? "bg-green-500"
                  : status === "connecting"
                    ? "bg-yellow-500"
                    : "bg-red-500")
              }
            />
            {statusMeta}
          </span>
          {uptime && (
            <span
              className="text-muted-foreground font-mono text-xs tabular-nums"
              title={t("header.serverUptime")}
            >
              {uptime}
            </span>
          )}
        </div>
        {/* Right: actions. */}
        <div className="flex items-center gap-2">
          <NewProcessDialog
            onStarted={(id) => showToast(t("toasts.started", { id }))}
            onError={(m) => showToast(m, true)}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label={t("header.switchLanguage")}
            title={t("header.switchLanguage")}
            onClick={() => {
              const idx = LANGUAGES.indexOf(language);
              changeLanguage(LANGUAGES[(idx + 1) % LANGUAGES.length]);
            }}
          >
            <LanguagesIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("header.switchToTheme", {
              theme: theme === "dark" ? t("common.lightTheme") : t("common.darkTheme"),
            })}
            onClick={toggle}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </header>

      {/* The log panel lives inside the 进程 (Processes) tab as a right column
          next to the process list, so it only takes up space on that tab. */}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-5">
          <div className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
              {/* Tabs double as the section title. Switching is purely
                  client-side — favorites are persisted in localStorage,
                  independent of the backend. */}
              <Tabs
                value={activeTab}
                onValueChange={(v) =>
                  setActiveTab(
                    v === "system" ? "system" : v === "history" ? "history" : "processes",
                  )
                }
              >
                <TabsList className="relative">
                  <TabsTab value="processes">
                    <ListIcon className="size-3.5" />
                    {t("header.tabProcesses")}
                    {processes.length + favorites.length > 0 && (
                      <span className="text-muted-foreground text-xs">
                        ({processes.length + favorites.length})
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
              </div>
            </div>
            {activeTab === "processes" ? (
              <div className="flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col">
                  <ProcessList
                    processes={processes}
                    favorites={favorites}
                    selectedId={selected?.id ?? null}
                    unread={unread}
                    favoritedSignatures={favoritedSignatures}
                    onToggleFavorite={handleToggleFavorite}
                    onSelectLogs={openLogFor}
                    onView={(p) => {
                      setViewing(p);
                      setDetailsOpen(true);
                    }}
                    onToast={showToast}
                    onLaunchFavorite={handleLaunchFavorite}
                    onEditFavorite={handleEditFavoriteCard}
                    onRemoveFavorite={handleRemoveFavorite}
                    onImport={() => setImportOpen(true)}
                    onOpenFolder={handleOpenFolder}
                    onRemoveCategory={handleRemoveCategory}
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
            ) : (
              <LogFilesView />
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
      />

      <FavoriteDialog
        open={favOpen}
        onOpenChange={setFavOpen}
        seedProcess={favSeedProcess}
        seedFavorite={favSeedFavorite}
        onCreate={handleCreateFavorite}
        onEdit={handleEditFavorite}
      />

      <ImportFavoritesDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImportFavorites}
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
