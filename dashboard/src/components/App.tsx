import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PanelLeftOpenIcon } from "lucide-react";
import { ProcessDetailsDialog } from "./NewProcessDialog";
import { SystemProcessList } from "./SystemProcessList";
import { LogFilesView } from "./LogFilesView";
import { Playground } from "./playground/Playground";
import { Toast } from "./Toast";
import { DevInspector } from "./DevInspector";
import { ClearDialogs } from "./app/ClearDialogs";
import { DashboardHeader } from "./app/DashboardHeader";
import { DashboardRail } from "./app/DashboardRail";
import { ProcessWorkspace } from "./app/ProcessWorkspace";
import { RoomsWorkspace } from "./app/RoomsWorkspace";
import {
  formatUptime,
  readTabRoute,
  TAB_ROUTES,
  writeTabRoute,
  type DashboardTab,
} from "./app/dashboardRoutes";
import { useDashboardSocket } from "@/lib/ws";
import { AnchoredToastProvider } from "@/registry/default/ui/toast";
import {
  clearAllProcesses,
  clearLogFiles,
  listRooms,
  getRoom,
  queryRoomLogs,
  listProcesses,
  openFolder,
  setProcessFavorite,
} from "@/lib/api";
import { readUrlState, writeUrlState } from "@/lib/urlState";
import type {
  ProcessListResponse,
  ProcessView,
  WsLogMessage,
  WsLogClearedMessage,
  RoomView,
  RoomLogEntry,
} from "@/lib/types";

export function App() {
  const [data, setData] = useState<ProcessListResponse | null>(null);
  // True once the first snapshot settled (REST or WS) — drives the processes
  // tab's skeleton so a loading list isn't mistaken for the empty state.
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [serverStartedAt, setServerStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<ProcessView | null>(null);
  const [logCollapsed, setLogCollapsed] = useState(() => readUrlState().collapsed);
  const [viewing, setViewing] = useState<ProcessView | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    isError?: boolean;
    key: number;
  } | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<DashboardTab>(readTabRoute);
  const [rooms, setRooms] = useState<RoomView[]>([]);
  // True after the first rooms fetch (whenever the rooms tab is opened) —
  // drives its skeleton; later 5s polls keep the stale list instead.
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomView | null>(null);
  const [roomLogs, setRoomLogs] = useState<RoomLogEntry[]>([]);
  const roomPanelClosedRef = useRef(false);
  const [roomInfoCollapsed, setRoomInfoCollapsed] = useState(false);
  const { t } = useTranslation();
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearLogsOpen, setClearLogsOpen] = useState(false);
  const [logFilesReloadKey, setLogFilesReloadKey] = useState(0);

  const { status, reconnectInMs, onProcessesMessage, onLogMessage, onLogCleared } =
    useDashboardSocket();
  const openLogIdRef = useRef<string | null>(null);
  const liveLogForwardRef = useRef<
    ((message: WsLogMessage | WsLogClearedMessage) => void) | null
  >(null);
  const initialProcRef = useRef<string | null>(readUrlState().procId);

  onProcessesMessage((message) => {
    setInitialLoaded(true);
    setData((current) => ({
      serverId: message.serverId ?? current?.serverId ?? "",
      pid: message.pid ?? current?.pid ?? 0,
      startedAt: message.startedAt ?? current?.startedAt,
      port: message.port ?? current?.port ?? null,
      processes: message.data,
    }));
    if (message.startedAt != null) setServerStartedAt(message.startedAt);
    setSelected((current) =>
      current ? message.data.find((process) => process.id === current.id) ?? null : null,
    );
  });

  onLogMessage((message) => {
    if (selectedRoom?.processIds.includes(message.processId)) {
      setRoomLogs((current) =>
        [
          ...current,
          {
            timestamp: message.timestamp,
            roomId: selectedRoom.id,
            processId: message.processId,
            stream: message.stream,
            message: message.message,
            level: message.level,
            memberId: message.memberId,
            clientName: message.clientName,
            data: message.data,
          },
        ].slice(-500),
      );
    }
    if (message.processId === openLogIdRef.current) {
      liveLogForwardRef.current?.(message);
    } else {
      setUnread((current) => ({
        ...current,
        [message.processId]: (current[message.processId] ?? 0) + 1,
      }));
    }
  });

  onLogCleared((message: WsLogClearedMessage) => {
    if (message.processId === openLogIdRef.current) {
      liveLogForwardRef.current?.(message);
    } else {
      setUnread((current) => ({ ...current, [message.processId]: 0 }));
    }
  });

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
        setSelected((current) =>
          current
            ? latest.processes.find((process) => process.id === current.id) ?? null
            : null,
        );
      } catch {
        // WebSocket status already reports connectivity; retry next interval.
      } finally {
        inFlight = false;
        setInitialLoaded(true);
      }
    };

    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (selected && data && !data.processes.some((process) => process.id === selected.id)) {
      setSelected(null);
    }
  }, [data, selected]);

  // Once the first process snapshot lands, settle the ?proc= deep link:
  // select the referenced process (collapsed state comes from the URL too, so
  // it is restored as-is), or drop the param when the id is unknown. Without
  // this the selection-sync effect below would clear the param on mount
  // before anything restores the selection.
  useEffect(() => {
    if (!data || !initialProcRef.current || data.processes.length === 0) return;
    const id = initialProcRef.current;
    initialProcRef.current = null;
    const process = data.processes.find((p) => p.id === id);
    if (process) setSelected(process);
    else writeUrlState({ procId: null });
  }, [data]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title = t("app.title");
  }, [t]);

  useEffect(() => {
    const syncTabFromRoute = () => setActiveTab(readTabRoute());
    if (window.location.hash.slice(1) !== TAB_ROUTES[activeTab]) {
      writeTabRoute(activeTab, true);
    }
    window.addEventListener("popstate", syncTabFromRoute);
    window.addEventListener("hashchange", syncTabFromRoute);
    return () => {
      window.removeEventListener("popstate", syncTabFromRoute);
      window.removeEventListener("hashchange", syncTabFromRoute);
    };
    // Route listeners are registered once; tab changes write the route directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uptime =
    serverStartedAt != null ? formatUptime(Math.max(0, now - serverStartedAt)) : null;

  const openLogFor = useCallback((process: ProcessView | null) => {
    setSelected(process);
    setLogCollapsed(false);
    openLogIdRef.current = process?.id ?? null;
    if (process) {
      setUnread((current) =>
        current[process.id] ? { ...current, [process.id]: 0 } : current,
      );
    }
  }, []);

  useEffect(() => {
    const open = activeTab === "processes" && !!selected && !logCollapsed;
    openLogIdRef.current = open && selected ? selected.id : null;
    if (open && selected) {
      setUnread((current) =>
        current[selected.id] ? { ...current, [selected.id]: 0 } : current,
      );
    }
  }, [selected, logCollapsed, activeTab]);

  useEffect(() => {
    // Don't overwrite procId until the ?proc= deep link has settled — the
    // mount-time run still has selected=null and would erase the param.
    writeUrlState({
      procId: initialProcRef.current ? undefined : (selected?.id ?? null),
      collapsed: logCollapsed,
    });
  }, [selected, logCollapsed]);

  const showToast = useCallback(
    (message: string, isError?: boolean) =>
      setToast({ message, isError, key: Date.now() }),
    [],
  );

  const handleToggleFavorite = useCallback(
    async (process: ProcessView) => {
      const favorite = !process.favorite;
      try {
        const updated = await setProcessFavorite(process.id, favorite);
        setData((current) =>
          current
            ? {
                ...current,
                processes: current.processes.map((row) =>
                  row.id === process.id ? updated : row,
                ),
              }
            : current,
        );
        showToast(
          t(favorite ? "toasts.addedToFavorites" : "toasts.removedFromFavorites", {
            name: process.name,
          }),
        );
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error), true);
      }
    },
    [showToast, t],
  );

  async function handleOpenFolder(path: string) {
    try {
      await openFolder(path);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), true);
    }
  }

  const processes = data?.processes ?? [];

  async function handleClearAll() {
    const snapshot = processes;
    setClearAllOpen(false);
    if (snapshot.length === 0) return;
    setSelected(null);
    try {
      const { deleted, notFound } = await clearAllProcesses(
        snapshot.map((process) => process.id),
      );
      if (notFound.length === 0) {
        showToast(t("toasts.cleared", { count: deleted.length }));
      } else {
        showToast(
          t("toasts.clearedPartial", {
            deleted: deleted.length,
            notFound: notFound.length,
          }),
          true,
        );
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), true);
    }
  }

  const displayedRoomMembers = useMemo(() => {
    if (!selectedRoom) return [];
    const members = [...selectedRoom.members];
    const known = new Set(members.map((member) => member.memberId));
    for (const entry of roomLogs) {
      if (!entry.memberId || known.has(entry.memberId)) continue;
      known.add(entry.memberId);
      members.push({
        memberId: entry.memberId,
        connectionId: `history:${entry.memberId}`,
        clientName: entry.clientName || entry.memberId,
        processId: entry.processId,
        connectedAt: entry.timestamp,
      });
    }
    return members;
  }, [selectedRoom, roomLogs]);

  useEffect(() => {
    if (activeTab !== "rooms") return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const latest = await listRooms();
        if (cancelled) return;
        setRooms(latest);
        setSelectedRoom((current) =>
          current
            ? latest.find((room) => room.id === current.id) ?? latest[0] ?? null
            : roomPanelClosedRef.current
              ? null
              : latest[0] ?? null,
        );
      } catch {
        // Connectivity status is shown in the header.
      } finally {
        if (!cancelled) setRoomsLoaded(true);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "rooms" || !selectedRoom) {
      setRoomLogs([]);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const [room, entries] = await Promise.all([
          getRoom(selectedRoom.id),
          queryRoomLogs(selectedRoom.id),
        ]);
        if (!cancelled) {
          setSelectedRoom(room);
          setRoomLogs(entries);
        }
      } catch {
        if (!cancelled) setRoomLogs([]);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedRoom?.id]);

  const groupOptions = useMemo(
    () =>
      [
        ...new Set(
          processes
            .map((process) => process.group?.trim())
            .filter((group): group is string => !!group),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [processes],
  );

  async function handleClearLogs() {
    setClearLogsOpen(false);
    try {
      const { deleted, skipped } = await clearLogFiles();
      setLogFilesReloadKey((key) => key + 1);
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
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), true);
    }
  }

  const handleTabChange = useCallback((tab: DashboardTab) => {
    setActiveTab(tab);
    writeTabRoute(tab);
  }, []);

  const runningCount = processes.filter(
    (process) => process.stoppedAt == null && process.status === "running",
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
    // AnchoredToastProvider hosts the element-anchored tooltip-style toasts
    // (e.g. CopyIconButton's "已复制" feedback). Global toasts stay separate.
    <AnchoredToastProvider>
    <div className="flex h-full gap-3 p-3">
      <DashboardRail
        status={status}
        statusMeta={statusMeta}
        uptime={uptime}
        processes={processes}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onToast={showToast}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="bg-card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
            <DashboardHeader
              activeTab={activeTab}
              data={data}
              processCount={processes.length}
              roomCount={rooms.length}
              runningCount={runningCount}
              onTabChange={handleTabChange}
              onClearAll={() => setClearAllOpen(true)}
              onClearLogs={() => setClearLogsOpen(true)}
            />
            {activeTab === "processes" ? (
              <ProcessWorkspace
                processes={processes}
                loading={!initialLoaded}
                selected={selected}
                logCollapsed={logCollapsed}
                unread={unread}
                onToggleFavorite={handleToggleFavorite}
                onSelectLogs={openLogFor}
                onView={(process) => {
                  setViewing(process);
                  setDetailsOpen(true);
                }}
                onToast={showToast}
                onOpenFolder={handleOpenFolder}
                onCloseLogs={() => setLogCollapsed(true)}
                onLiveLog={(callback) => {
                  liveLogForwardRef.current = callback;
                }}
              />
            ) : activeTab === "rooms" ? (
              <RoomsWorkspace
                rooms={rooms}
                loading={!roomsLoaded}
                selectedRoom={selectedRoom}
                roomLogs={roomLogs}
                displayedRoomMembers={displayedRoomMembers}
                roomInfoCollapsed={roomInfoCollapsed}
                onSelectRoom={(room) => {
                  roomPanelClosedRef.current = false;
                  setRoomInfoCollapsed(false);
                  setSelectedRoom(room);
                }}
                onToggleRoomInfo={() =>
                  setRoomInfoCollapsed((collapsed) => !collapsed)
                }
                onToast={showToast}
              />
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
        groupOptions={groupOptions}
      />
      <ClearDialogs
        clearAllOpen={clearAllOpen}
        clearLogsOpen={clearLogsOpen}
        processCount={processes.length}
        onClearAllOpenChange={setClearAllOpen}
        onClearLogsOpenChange={setClearLogsOpen}
        onClearAll={handleClearAll}
        onClearLogs={handleClearLogs}
      />
      <DevInspector />
    </div>
    </AnchoredToastProvider>
  );
}
