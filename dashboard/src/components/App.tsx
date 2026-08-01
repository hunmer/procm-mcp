import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/registry/default/ui/button";
import { Badge } from "@/registry/default/ui/badge";
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsTab,
} from "@/registry/default/ui/tabs";
import { ListIcon, MoonIcon, PanelLeftOpenIcon, StarIcon, SunIcon } from "lucide-react";
import {
  FavoriteDialog,
  NewProcessDialog,
  ProcessDetailsDialog,
} from "./NewProcessDialog";
import { ProcessList } from "./ProcessList";
import { FavoritesView } from "./FavoritesView";
import { LogPanel } from "./LogPanel";
import { Toast } from "./Toast";
import { DevInspector } from "./DevInspector";
import { useTheme } from "@/lib/useTheme";
import { useDashboardSocket } from "@/lib/ws";
import { startProcess } from "@/lib/api";
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
  const [logCollapsed, setLogCollapsed] = useState(false);
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
  // Which list tab is shown: the live process table or the favorites grid.
  const [activeTab, setActiveTab] = useState<"processes" | "favorites">(
    "processes",
  );
  const { theme, toggle } = useTheme();

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

  // Live updates from the backend: replace the process list and keep the
  // selected log target in sync with the latest view. This replaces the old
  // 3s polling loop.
  onProcessesMessage((m) => {
    setData({
      serverId: m.serverId ?? data?.serverId ?? "",
      pid: m.pid ?? data?.pid ?? 0,
      processes: m.data,
    });
    if (m.startedAt != null) setServerStartedAt(m.startedAt);
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

  // Drop the selected process if it no longer exists (e.g. after being stopped).
  useEffect(() => {
    if (selected && data && !data.processes.some((p) => p.id === selected.id)) {
      setSelected(null);
    }
  }, [data, selected]);

  // Tick once per second so the uptime display updates live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  // Keep openLogIdRef in sync when the panel collapses/expands or selection
  // changes via other paths.
  useEffect(() => {
    openLogIdRef.current =
      selected && !logCollapsed ? selected.id : null;
    if (selected && !logCollapsed) {
      setUnread((cur) => (cur[selected.id] ? { ...cur, [selected.id]: 0 } : cur));
    }
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
        showToast(`Removed “${p.name}” from favorites`);
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
      showToast(`Already in favorites: ${fav.name ?? fav.script}`, true);
      return;
    }
    addFavorite(fav);
    showToast(`Added “${fav.name ?? fav.script}” to favorites`);
  }

  function handleEditFavorite(fav: Favorite) {
    updateFavorite(fav);
    showToast(`Updated “${fav.name ?? fav.script}”`);
  }

  function handleRemoveFavorite(id: string) {
    const f = favorites.find((x) => x.id === id);
    removeFavorite(id);
    showToast(`Removed “${f?.name ?? f?.script ?? "favorite"}”`);
  }

  // Launch a favorite as a real process via the backend. On success, jump to
  // the Processes tab so the user sees it appear in the live list.
  async function handleLaunchFavorite(fav: Favorite) {
    try {
      const r = await startProcess(favoriteToStartBody(fav));
      showToast(`Started: ${r.id}`);
      setActiveTab("processes");
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

  const processes = data?.processes ?? [];
  // Live (non-stopped, running) processes — shown as a badge in the header.
  const runningCount = processes.filter(
    (p) => p.stoppedAt == null && p.status === "running",
  ).length;

  const statusMeta =
    status === "open"
      ? "connected"
      : status === "connecting"
        ? "connecting…"
        : reconnectInMs != null
          ? `reconnecting in ${Math.ceil(reconnectInMs / 1000)}s`
          : "reconnecting…";

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
              title="Server uptime"
            >
              {uptime}
            </span>
          )}
        </div>
        {/* Right: actions. */}
        <div className="flex items-center gap-2">
          <NewProcessDialog
            onStarted={(id) => showToast(`Started: ${id}`)}
            onError={(m) => showToast(m, true)}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={toggle}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </header>

      {/* Inline left/right split: selecting a process's logs opens the right
          column, which squeezes the left process list (no overlay). */}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-5">
          <div className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
              {/* Tabs double as the section title: 进程 (Processes) / 收藏
                  (Favorites). Switching is purely client-side — favorites are
                  persisted in localStorage, independent of the backend. */}
              <Tabs
                value={activeTab}
                onValueChange={(v) =>
                  setActiveTab(v === "favorites" ? "favorites" : "processes")
                }
              >
                <TabsList className="relative">
                  <TabsTab value="processes">
                    <ListIcon className="size-3.5" />
                    Processes
                    {processes.length > 0 && (
                      <span className="text-muted-foreground text-xs">
                        ({processes.length})
                      </span>
                    )}
                  </TabsTab>
                  <TabsTab value="favorites">
                    <StarIcon className="size-3.5" />
                    Favorites
                    {favorites.length > 0 && (
                      <span className="text-muted-foreground text-xs">
                        ({favorites.length})
                      </span>
                    )}
                  </TabsTab>
                  <TabsIndicator />
                </TabsList>
              </Tabs>
              {activeTab === "processes" && runningCount > 0 && (
                <Badge variant="success" className="gap-1.5">
                  <span className="inline-block size-1.5 rounded-full bg-current" />
                  {runningCount} running
                </Badge>
              )}
            </div>
            {activeTab === "processes" ? (
              <ProcessList
                processes={processes}
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
              />
            ) : (
              <FavoritesView
                favorites={favorites}
                onLaunch={handleLaunchFavorite}
                onEdit={handleEditFavoriteCard}
                onRemove={handleRemoveFavorite}
              />
            )}
          </div>
        </main>

        {selected && !logCollapsed && (
          <div className="w-full max-w-[min(640px,46vw)] shrink-0 p-5 pl-0">
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

      {/* When the log panel is collapsed but a process is selected, show a
          slim rail to reopen it, instead of losing the selection entirely. */}
      {selected && logCollapsed && (
        <button
          type="button"
          onClick={() => setLogCollapsed(false)}
          className="bg-card hover:bg-accent fixed right-0 top-1/2 z-20 -translate-y-1/2 rounded-l-lg border-y border-l py-3 pl-1.5 pr-1 text-muted-foreground shadow-lg"
          title={`Show logs: ${selected.name}`}
          aria-label={`Show logs for ${selected.name}`}
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
