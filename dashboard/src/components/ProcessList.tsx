import { useMemo, useState } from "react";
import { DndContext, DragOverlay, closestCorners, pointerWithin, type CollisionDetection, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  GripVerticalIcon,
  InboxIcon,
  ListXIcon,
  PencilIcon,
} from "lucide-react";
import { clearAllProcesses, updateProcess } from "@/lib/api";
import { Badge } from "@/registry/default/ui/badge";
import { Button } from "@/registry/default/ui/button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/registry/default/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import { Frame, FrameHeader, FramePanel } from "@/registry/default/ui/frame";
import { Skeleton } from "@/registry/default/ui/skeleton";
import { Card, CardHeader, CardPanel } from "@/registry/default/ui/card";
import type { ProcessView } from "@/lib/types";
import {
  type ProcessListProps,
  type RowActions,
  type SortMode,
  type StatusFilter,
} from "./process-list/types";
import { useProcessActions } from "./process-list/useProcessActions";
import { canStopProcess } from "./process-list/utils";
import { ProcessFilterBar } from "./process-list/ProcessFilterBar";
import { ProcessCard } from "./process-list/ProcessCard";
import { ProcessDialogs } from "./process-list/ProcessDialogs";
import {
  RenameGroupDialog,
  type PendingGroupRename,
} from "./process-list/RenameGroupDialog";
import { CreateDropdown } from "./CreateDropdown";
// BorderBeam is intentionally kept as the requested standalone JSX asset.
// @ts-expect-error The JSX asset does not ship a generated declaration.
import BorderBeam from "./BorderBeam";

// Whether a group label looks like an absolute folder path that the backend
// could open in the OS file manager. Matches Windows drive paths (C:\, C:/),
// UNC paths (\\server\share), and POSIX absolute paths (/...). Relative names
// like "Dev servers" or the Ungrouped bucket return false so no button shows.
function looksLikePath(label: string): boolean {
  return /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(label.trim());
}

// Collapsed group labels, persisted across reloads by group label. Best-effort:
// localStorage may be unavailable (private mode); the in-memory state still
// works for the session.
const COLLAPSED_KEY = "procm.collapsedGroups";
const UNGROUPED = "Ungrouped";

function groupKeyOf(group: string | undefined): string {
  const value = (group ?? "").trim();
  return value || UNGROUPED;
}

// Pinned process ids, persisted across reloads. Ids of deleted processes may
// linger; they simply never match a row again.
const PINNED_KEY = "procm.pinnedProcesses";
const GROUP_ORDER_KEY = "procm.groupOrder";
const PROCESS_ORDER_KEY = "procm.processOrder";

function loadIdSet(key: string): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(
      Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function saveIdSet(key: string, ids: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // localStorage may be unavailable; ignore.
  }
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function loadCollapsed(): Set<string> {
  return loadIdSet(COLLAPSED_KEY);
}

interface Group {
  label: string;
  processes: ProcessView[];
}

// Order the rows inside a group: pinned rows always float to the top; the
// sort mode then applies — "startedAt" newest-first, "none" keeps the
// backend's push order (stabilized via the original index).
function orderGroup(
  rows: ProcessView[],
  sortMode: SortMode,
  pinned: Set<string>,
): ProcessView[] {
  if (pinned.size === 0 && sortMode === "none") return rows;
  return rows
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const pa = pinned.has(a.p.id) ? 1 : 0;
      const pb = pinned.has(b.p.id) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (sortMode === "startedAt") {
        return (
          (b.p.lastStartedAt ?? b.p.startedAt ?? 0) -
          (a.p.lastStartedAt ?? a.p.startedAt ?? 0)
        );
      }
      return a.i - b.i;
    })
    .map(({ p }) => p);
}

interface GroupSectionProps {
  g: Group;
  // Collapsible state is controlled by the parent so drag-start can collapse all groups.
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: string | null;
  unread: Record<string, number>;
  // Pinned process ids (rows that float to the top of their group).
  pinnedIds: Set<string>;
  actions: RowActions;
  onOpenFolder: (path: string) => void;
  // Pin/unpin a process row.
  onTogglePin: (p: ProcessView) => void;
  // Only called for the Ungrouped bucket: stop its running processes and
  // remove every record from the list.
  onClearUngrouped: (g: Group) => void;
  // Toast sink for the group "+" create menu (start success/error, import
  // progress).
  onToast: (message: string, isError?: boolean) => void;
  // Existing group labels offered by the create menu's group combobox.
  groupOptions: string[];
  // Open the rename-group dialog for this group: every process of the group
  // is moved to the name typed inside.
  onRenameGroup: (g: Group) => void;
  processDragEnabled: boolean;
}

// One category section, following the "Frame with collapsible content" pattern
// (coss p-frame-2): a FrameHeader whose trigger toggles the panel with a
// rotating chevron, group actions on the right, and the card grid inside the
// collapsible FramePanel — live process cards first, then favorite cards.
function GroupSection({
  g,
  open,
  onOpenChange,
  selectedId,
  unread,
  pinnedIds,
  actions,
  onOpenFolder,
  onTogglePin,
  onClearUngrouped,
  onToast,
  groupOptions,
  onRenameGroup,
  processDragEnabled,
}: GroupSectionProps) {
  const { t } = useTranslation();
  const sortable = useSortable({ id: `group:${g.label}`, data: { type: "group", label: g.label } });
  const runningCount = g.processes.filter(canStopProcess).length;
  return (
    <div ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className="group/section" data-dragging={sortable.isDragging || undefined}>
    <Frame className="w-full">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <FrameHeader className="flex-row items-center justify-between px-2 py-2">
          <CollapsibleTrigger
            // Rotate only the leading chevron when the panel is open.
            className="data-panel-open:[&>svg:first-child]:rotate-180"
            render={<Button variant="ghost" className="gap-2 px-2" />}
          >
            <ChevronDownIcon className="size-4 transition-transform" />
            <FolderIcon className="text-muted-foreground size-3.5" />
            <span className="text-sm font-semibold">
              {g.label === UNGROUPED ? t("processes.ungrouped") : g.label}
            </span>
            <Badge variant="secondary" className="tabular-nums">
            {g.processes.length}
            </Badge>
          </CollapsibleTrigger>
          <div className="flex items-center gap-0.5">
            <Button size="icon-sm" variant="ghost" aria-label="拖拽排序分组" title="拖拽排序分组" className="cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover/section:opacity-100" {...sortable.attributes} {...sortable.listeners}>
              <GripVerticalIcon />
            </Button>
            {runningCount > 0 && (
              <Badge
                variant="success"
                className="mr-1 tabular-nums"
                title={t("processes.runningCountTitle", { count: runningCount })}
              >
                {runningCount}
              </Badge>
            )}
            {/* Group "+": the same create menu as the header, with this
                group pre-filled into the new-process and import dialogs. */}
            <CreateDropdown
              trigger={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground"
                />
              }
              defaultGroup={g.label === UNGROUPED ? "" : g.label}
              defaultImportGroup={g.label === UNGROUPED ? "" : g.label}
              groupOptions={groupOptions}
              onStarted={(id) => onToast(t("toasts.started", { id }))}
              onError={(m) => onToast(m, true)}
              onToast={onToast}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("processes.renameGroupAria")}
              title={t("processes.renameGroupAria")}
              onClick={() => onRenameGroup(g)}
              className="text-muted-foreground"
            >
              <PencilIcon />
            </Button>
            {looksLikePath(g.label) && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("favorites.openFolderAria", { label: g.label })}
                title={t("favorites.openFolderTitle")}
                onClick={() => onOpenFolder(g.label)}
                className="text-muted-foreground"
              >
                <FolderOpenIcon />
              </Button>
            )}
            {g.label === UNGROUPED && (
              g.processes.length > 0 && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("processes.clearUngroupedAria")}
                  title={t("processes.clearUngroupedTitle")}
                  onClick={() => onClearUngrouped(g)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <ListXIcon />
                </Button>
              )
            )}
          </div>
        </FrameHeader>
        <CollapsiblePanel>
          <FramePanel className="p-3">
            <SortableContext items={g.processes.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {g.processes.map((p) => (
                <div key={p.id} className="relative h-full rounded-2xl">
                  <ProcessCard
                    p={p}
                    isActive={p.id === selectedId}
                    unreadCount={unread[p.id] ?? 0}
                    pinned={pinnedIds.has(p.id)}
                    onTogglePin={onTogglePin}
                    actions={actions}
                    dragGroup={g.label}
                    dragEnabled={processDragEnabled}
                  />
                  {canStopProcess(p) && (
                    <BorderBeam
                      aria-hidden="true"
                      className="rounded-2xl"
                      duration={3}
                      borderWidth={2}
                      colorFrom="#22c55e"
                      colorTo="#06b6d4"
                    />
                  )}
                </div>
              ))}
            </div>
            </SortableContext>
          </FramePanel>
        </CollapsiblePanel>
      </Collapsible>
    </Frame>
    </div>
  );
}

// First-load placeholder mirroring a ProcessCard: header (name + status badge,
// desc line) and panel (command block, cwd block, action row + primary button).
// Same Card/CardHeader/CardPanel surfaces as the real card so borders and
// spacing match; p-skeleton-1: https://coss.com/ui/r/p-skeleton-1.json
function ProcessCardSkeleton() {
  return (
    <Card>
      <CardHeader className="border-b p-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-5 w-14" />
          </div>
          <Skeleton className="h-3 w-2/3" />
        </div>
      </CardHeader>
      <CardPanel className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="flex flex-col gap-1">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-8 w-16" />
        </div>
      </CardPanel>
    </Card>
  );
}

// The process list uses one card shape for every process and groups by the
// process record's own group field.
export function ProcessList({
  processes,
  loading = false,
  selectedId,
  unread,
  onToggleFavorite,
  onSelectLogs,
  onView,
  onToast,
  onOpenFolder,
}: ProcessListProps) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [nameFilter, setNameFilter] = useState("");
  // How the rows inside each group are ordered (pinned always first).
  const [sortMode, setSortMode] = useState<SortMode>("none");
  // Pinned process ids, persisted to localStorage.
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => loadIdSet(PINNED_KEY));
  // Which groups the user collapsed (by label), persisted to localStorage.
  const [collapsedLabels, setCollapsedLabels] = useState<Set<string>>(loadCollapsed);
  const [groupOrder, setGroupOrder] = useState<string[]>(() => loadJson(GROUP_ORDER_KEY, []));
  const [processOrder, setProcessOrder] = useState<Record<string, string[]>>(() => loadJson(PROCESS_ORDER_KEY, {}));
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const processDragEnabled =
    statusFilter === "all" && sortMode === "none" && nameFilter.trim() === "";

  function moveItem(items: string[], from: string, to: string) {
    const fromIndex = items.indexOf(from);
    const toIndex = items.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return items;
    const next = items.filter((id) => id !== from);
    const adjustedTarget = next.indexOf(to);
    const insertIndex = fromIndex < toIndex ? adjustedTarget + 1 : adjustedTarget;
    next.splice(insertIndex, 0, from);
    return next;
  }

  function moveGroup(from: string, to: string) {
    setGroupOrder((current) => {
      const labels = [...new Set(processes.map((p) => groupKeyOf(p.group ?? undefined)))].sort((a, b) => {
        if (a === UNGROUPED) return 1;
        if (b === UNGROUPED) return -1;
        return a.localeCompare(b);
      });
      const base = [...current.filter((label) => labels.includes(label)), ...labels.filter((label) => !current.includes(label))];
      const next = moveItem(base, from, to);
      saveJson(GROUP_ORDER_KEY, next);
      return next;
    });
  }

  function moveProcess(group: string, from: string, to: string) {
    setProcessOrder((current) => {
      const ids = processes.filter((p) => groupKeyOf(p.group ?? undefined) === group).map((p) => p.id);
      const base = [...(current[group] ?? []).filter((id) => ids.includes(id)), ...ids.filter((id) => !(current[group] ?? []).includes(id))];
      const next = { ...current, [group]: moveItem(base, from, to) };
      saveJson(PROCESS_ORDER_KEY, next);
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveDragId(id);
    if (event.active.data.current?.type !== "group") return;
    const labels = new Set(processes.map((p) => groupKeyOf(p.group ?? undefined)));
    setCollapsedLabels(labels);
    saveJson(COLLAPSED_KEY, [...labels]);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeData = active.data.current;
    const overData = over.data.current;
    const type = activeData?.type;
    if (type === "group" && overData?.type === "group") {
      moveGroup(String(activeData!.label), String(overData.label));
    } else if (type === "process" && overData?.type === "process" && activeData?.group === overData?.group) {
      moveProcess(String(activeData!.group), String(active.id), String(over.id));
    }
  }


  const activeDragProcess = activeDragId && processes.find((p) => p.id === activeDragId);
  const activeDragGroup = activeDragId?.startsWith("group:") ? activeDragId.slice(6) : null;

  // Keep group drags from being captured by the process droppables nested in
  // each panel. Corner detection also activates as soon as the pointer enters
  // the adjacent section instead of waiting for its center.
  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const type = args.active.data.current?.type;
    const containers = args.droppableContainers.filter((container) => {
      if (container.data.current?.type !== type) return false;
      if (type === "process") {
        return container.data.current?.group === args.active.data.current?.group;
      }
      return true;
    });
    const scopedArgs = { ...args, droppableContainers: containers };
    const pointerMatches = pointerWithin(scopedArgs);
    return pointerMatches.length > 0 ? pointerMatches : closestCorners(scopedArgs);
  };

  function togglePin(p: ProcessView) {
    setPinnedIds((cur) => {
      const next = new Set(cur);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      saveIdSet(PINNED_KEY, next);
      return next;
    });
  }

  function toggleGroup(label: string, open: boolean) {
    setCollapsedLabels((cur) => {
      const next = new Set(cur);
      if (open) next.delete(label);
      else next.add(label);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // localStorage may be unavailable; ignore.
      }
      return next;
    });
  }

  const {
    pendingDelete,
    pendingStop,
    requestDelete,
    requestStop,
    confirmDelete,
    confirmStop,
    handleRestart,
    handleCopyId,
    handleCopyCommand,
    dismissDelete,
    dismissStop,
  } = useProcessActions(onToast);

  // Clearing the Ungrouped bucket. The pending state holds the bucket snapshot
  // from click time, so WS updates arriving while the dialog is open don't
  // change what gets cleared.
  const [pendingClear, setPendingClear] = useState<Group | null>(null);

  // Rename-group dialog state, snapshotted at click time. `ids` comes from the
  // unfiltered list so an active status/name filter doesn't silently skip rows
  // of the clicked group.
  const [pendingRename, setPendingRename] = useState<PendingGroupRename | null>(
    null,
  );

  function requestRenameGroup(g: Group) {
    const isUngrouped = g.label === UNGROUPED;
    const ids = processes
      .filter((p) => groupKeyOf(p.group ?? undefined) === g.label)
      .map((p) => p.id);
    setPendingRename({
      label: isUngrouped ? t("processes.ungrouped") : g.label,
      seed: isUngrouped ? "" : g.label,
      count: ids.length,
      ids,
    });
  }

  // Move every snapshotted process to the typed group ("" = Ungrouped). A name
  // equal to the current one is a no-op; the WS push refreshes the list.
  async function confirmRenameGroup(value: string) {
    const pending = pendingRename;
    setPendingRename(null);
    if (!pending || value === pending.seed) return;
    const results = await Promise.allSettled(
      pending.ids.map((id) => updateProcess(id, { group: value || null })),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      onToast(t("toasts.groupMoveFailed", { failed }), true);
      return;
    }
    onToast(
      t("toasts.groupMoved", {
        count: pending.ids.length,
        label: value || t("processes.ungrouped"),
      }),
    );
  }

  // Existing group labels offered by the dialog's group combobox.
  const groupOptions = useMemo(
    () =>
      [...new Set(processes.map((p) => p.group?.trim()).filter((g): g is string => !!g))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [processes],
  );

  function requestClearUngrouped(g: Group) {
    if (g.label !== UNGROUPED) return;
    setPendingClear(g);
  }

  async function confirmClearUngrouped() {
    const g = pendingClear;
    setPendingClear(null);
    if (!g) return;
    try {
      // Bulk delete stops running processes first, then erases the records;
      // the WS push refreshes the list.
      if (g.processes.length > 0) {
        await clearAllProcesses(g.processes.map((p) => p.id));
      }
      onToast(
        t("toasts.clearedUngrouped", {
          count: g.processes.length,
        }),
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  const clearCounts = pendingClear && {
    processes: pendingClear.processes.length,
    running: pendingClear.processes.filter(canStopProcess).length,
  };

  // Bundle the per-row callbacks so the cards and the context menu take a
  // single prop instead of a long argument list.
  const actions: RowActions = {
    onSelectLogs,
    onView,
    onToggleFavorite,
    onRestart: handleRestart,
    onRequestStop: requestStop,
    onRequestDelete: requestDelete,
    onCopyId: handleCopyId,
    onCopyCommand: handleCopyCommand,
  };

  // Client-side filtering by status and name. "expired" is a UI-only filter
  // (stoppedAt != null) that doesn't exist in the ProcessStatus enum.
  const filteredProcesses = useMemo(() => {
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

  // Grouping is computed from the filtered sets so empty groups vanish.
  // Named groups sort alphabetically; the Ungrouped catch-all goes last.
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    const bucket = (label: string): Group => {
      let b = map.get(label);
      if (!b) {
        b = { label, processes: [] };
        map.set(label, b);
      }
      return b;
    };
    for (const p of filteredProcesses) {
      bucket(groupKeyOf(p.group ?? undefined)).processes.push(p);
    }
    return [...map.values()]
      .map((g) => ({
        label: g.label,
        // Pinned rows first, then the selected sort order.
        processes: orderGroup(g.processes, sortMode, pinnedIds),
      }))
      .sort((a, b) => {
        const ai = groupOrder.indexOf(a.label); const bi = groupOrder.indexOf(b.label);
        if (ai >= 0 || bi >= 0) return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
        if (a.label === UNGROUPED) return 1;
        if (b.label === UNGROUPED) return -1;
        return a.label.localeCompare(b.label);
      });
  }, [filteredProcesses, sortMode, pinnedIds, groupOrder, processOrder]);

  const orderedGroups = groups.map((g) => ({
    ...g,
    processes: processDragEnabled && processOrder[g.label]?.length
      ? [...g.processes].sort((a, b) => (processOrder[g.label].indexOf(a.id) < 0 ? Number.MAX_SAFE_INTEGER : processOrder[g.label].indexOf(a.id)) - (processOrder[g.label].indexOf(b.id) < 0 ? Number.MAX_SAFE_INTEGER : processOrder[g.label].indexOf(b.id)))
      : g.processes,
  }));

  const hasAnything = processes.length > 0;

  // The Ungrouped catch-all is pinned in its own area above the scrolling
  // region, so it stays put while the named groups scroll underneath. When
  // it's the only group, it simply takes the full height.
  const ungrouped = orderedGroups.find((g) => g.label === UNGROUPED) ?? null;
  const grouped = orderedGroups.filter((g) => g.label !== UNGROUPED);

  return (
    <DndContext collisionDetection={collisionDetectionStrategy} onDragStart={handleDragStart} onDragCancel={() => setActiveDragId(null)} onDragEnd={handleDragEnd}>
    <div className="flex h-full min-h-0 flex-col">
      <ProcessFilterBar
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        nameFilter={nameFilter}
        onNameFilterChange={setNameFilter}
        shownCount={filteredProcesses.length}
        totalCount={processes.length}
        right={
          <CreateDropdown
            onStarted={(id) => onToast(t("toasts.started", { id }))}
            onError={(m) => onToast(m, true)}
            onToast={onToast}
          />
        }
      />

      {/* `@container` tracks each region's own width (not the viewport), so
          the grids collapse to one column when the log panel squeezes this
          side. */}
      {loading ? (
        <div className="@container min-h-0 flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <ProcessCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : grouped.length > 0 ? (
        <>
          {ungrouped && (
            <div className="@container max-h-[50%] shrink-0 overflow-auto border-b p-4">
              <SortableContext items={orderedGroups.map((g) => `group:${g.label}`)} strategy={verticalListSortingStrategy}>
              <GroupSection
                g={ungrouped}
                open={!collapsedLabels.has(ungrouped.label)}
                onOpenChange={(open) => toggleGroup(ungrouped.label, open)}
                selectedId={selectedId}
                unread={unread}
                actions={actions}
                onOpenFolder={onOpenFolder}
                onClearUngrouped={requestClearUngrouped}
                onToast={onToast}
                groupOptions={groupOptions}
                onRenameGroup={requestRenameGroup}
                pinnedIds={pinnedIds}
                onTogglePin={togglePin}
                processDragEnabled={processDragEnabled}
              />
              </SortableContext>
            </div>
          )}
          <div className="@container min-h-0 flex-1 overflow-auto p-4">
            <div className="flex flex-col gap-4">
              <SortableContext items={grouped.map((g) => `group:${g.label}`)} strategy={verticalListSortingStrategy}>
              {grouped.map((g) => (
                <GroupSection
                  key={g.label}
                  g={g}
                  open={!collapsedLabels.has(g.label)}
                  onOpenChange={(open) => toggleGroup(g.label, open)}
                  selectedId={selectedId}
                  unread={unread}
                  actions={actions}
                  onOpenFolder={onOpenFolder}
                  onClearUngrouped={requestClearUngrouped}
                  onToast={onToast}
                  groupOptions={groupOptions}
                  onRenameGroup={requestRenameGroup}
                  pinnedIds={pinnedIds}
                  onTogglePin={togglePin}
                  processDragEnabled={processDragEnabled}
                />
              ))}
              </SortableContext>
            </div>
          </div>
        </>
      ) : ungrouped ? (
        <div className="@container min-h-0 flex-1 overflow-auto p-4">
          <SortableContext items={[`group:${ungrouped.label}`]} strategy={verticalListSortingStrategy}>
          <GroupSection
            g={ungrouped}
            open={!collapsedLabels.has(ungrouped.label)}
            onOpenChange={(open) => toggleGroup(ungrouped.label, open)}
            selectedId={selectedId}
            unread={unread}
            actions={actions}
            onOpenFolder={onOpenFolder}
            onClearUngrouped={requestClearUngrouped}
            onToast={onToast}
            groupOptions={groupOptions}
            onRenameGroup={requestRenameGroup}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
            processDragEnabled={processDragEnabled}
          />
          </SortableContext>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <Empty className="mx-auto max-w-sm py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>
                {hasAnything
                  ? t("processes.emptyNoMatches")
                  : t("processes.emptyNoProcesses")}
              </EmptyTitle>
              <EmptyDescription>
                {hasAnything
                  ? t("processes.emptyDescNoMatches")
                  : t("processes.emptyDescNoProcesses")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}

      <ProcessDialogs
        pendingDelete={pendingDelete}
        pendingStop={pendingStop}
        pendingClearUngrouped={clearCounts}
        onConfirmDelete={confirmDelete}
        onConfirmStop={confirmStop}
        onConfirmClearUngrouped={confirmClearUngrouped}
        onDismissDelete={dismissDelete}
        onDismissStop={dismissStop}
        onDismissClearUngrouped={() => setPendingClear(null)}
      />

      {/* Group-header pencil: move every process of the clicked group to the
          typed group name (a rename is a whole-group move). */}
      <RenameGroupDialog
        group={pendingRename}
        onOpenChange={(open) => {
          if (!open) setPendingRename(null);
        }}
        onSubmit={confirmRenameGroup}
      />
    </div>
    <DragOverlay dropAnimation={null}>
      {activeDragProcess ? <Card className="w-80 opacity-95 shadow-xl"><CardHeader className="p-4"><span className="font-semibold">{activeDragProcess.name}</span></CardHeader></Card> : activeDragGroup ? <Frame className="w-80 opacity-95 shadow-xl"><div className="p-3 text-sm font-semibold">{activeDragGroup}</div></Frame> : null}
    </DragOverlay>
    </DndContext>
  );
}
