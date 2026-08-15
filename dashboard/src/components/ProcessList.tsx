import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  InboxIcon,
  ListXIcon,
  TrashIcon,
} from "lucide-react";
import { clearAllProcesses } from "@/lib/api";
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
import {
  favoriteSignature,
  groupKeyOf,
  UNGROUPED,
  type Favorite,
} from "@/lib/favorites";
import type { ProcessView } from "@/lib/types";
import {
  type ProcessListProps,
  type RowActions,
  type StatusFilter,
} from "./process-list/types";
import { useProcessActions } from "./process-list/useProcessActions";
import { canStopProcess } from "./process-list/utils";
import { ProcessFilterBar } from "./process-list/ProcessFilterBar";
import { ProcessCard } from "./process-list/ProcessCard";
import { FavoriteCard } from "./process-list/FavoriteCard";
import { ProcessDialogs } from "./process-list/ProcessDialogs";

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

function loadCollapsed(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(
      Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [],
    );
  } catch {
    return new Set();
  }
}

interface Group {
  label: string;
  processes: ProcessView[];
  favorites: Favorite[];
}

interface GroupSectionProps {
  g: Group;
  // Collapsible state: uncontrolled with a persisted default (collapsed group
  // labels live in localStorage), with changes reported back for persistence.
  defaultOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: string | null;
  unread: Record<string, number>;
  favoritedSignatures: Set<string>;
  actions: RowActions;
  favActions: {
    onLaunch: (f: Favorite) => void;
    onEdit: (f: Favorite) => void;
    onRemove: (id: string) => void;
  };
  onOpenFolder: (path: string) => void;
  onRemoveCategory: (ids: string[]) => void;
}

// One category section, following the "Frame with collapsible content" pattern
// (coss p-frame-2): a FrameHeader whose trigger toggles the panel with a
// rotating chevron, group actions on the right, and the card grid inside the
// collapsible FramePanel — live process cards first, then favorite cards.
function GroupSection({
  g,
  defaultOpen,
  onOpenChange,
  selectedId,
  unread,
  favoritedSignatures,
  actions,
  favActions,
  onOpenFolder,
  onRemoveCategory,
}: GroupSectionProps) {
  const { t } = useTranslation();
  return (
    <Frame className="w-full">
      <Collapsible defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
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
              {g.processes.length + g.favorites.length}
            </Badge>
          </CollapsibleTrigger>
          <div className="flex items-center gap-0.5">
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
            {g.favorites.length > 0 && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("favorites.deleteGroupAria", { label: g.label })}
                title={t("favorites.deleteGroupTitle")}
                onClick={() => onRemoveCategory(g.favorites.map((f) => f.id))}
                className="text-muted-foreground hover:text-destructive"
              >
                <TrashIcon />
              </Button>
            )}
          </div>
        </FrameHeader>
        <CollapsiblePanel>
          <FramePanel className="p-3">
            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {g.processes.map((p) => (
                <ProcessCard
                  key={p.id}
                  p={p}
                  isActive={p.id === selectedId}
                  unreadCount={unread[p.id] ?? 0}
                  favoritedSignatures={favoritedSignatures}
                  actions={actions}
                />
              ))}
              {g.favorites.map((f) => (
                <FavoriteCard
                  key={f.id}
                  favorite={f}
                  onLaunch={() => favActions.onLaunch(f)}
                  onEdit={() => favActions.onEdit(f)}
                  onRemove={() => favActions.onRemove(f.id)}
                />
              ))}
            </div>
          </FramePanel>
        </CollapsiblePanel>
      </Collapsible>
    </Frame>
  );
}

// The merged 进程 list: one grouped view that combines the live processes with
// the favorites they were started from. A process is placed in the category
// group of the favorite with the same launch signature (script+args+cwd);
// everything else — plus favorites without a category — falls into the
// 【未分组】(Ungrouped) bucket. Groups render in the favorites style: a folder
// header with a count badge, then a card grid.
export function ProcessList({
  processes,
  favorites,
  selectedId,
  unread,
  favoritedSignatures,
  onToggleFavorite,
  onSelectLogs,
  onView,
  onToast,
  onLaunchFavorite,
  onEditFavorite,
  onRemoveFavorite,
  onImport,
  onOpenFolder,
  onRemoveCategory,
}: ProcessListProps) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [nameFilter, setNameFilter] = useState("");
  // Which groups the user collapsed (by label), persisted to localStorage.
  const [collapsedLabels, setCollapsedLabels] = useState<Set<string>>(loadCollapsed);

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

  // Favorites have no status, so only the name search applies to them.
  const filteredFavorites = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter((f) =>
      [f.name ?? "", f.script, f.args.join(" "), f.desc ?? "", groupKeyOf(f.group)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [favorites, nameFilter]);

  // Launch signature -> group label, so a process started from a favorite is
  // grouped under that favorite's category. addFavorite de-dupes by signature,
  // so the first (and only) favorite wins.
  const sigGroup = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of favorites) {
      const sig = favoriteSignature(f);
      if (!m.has(sig)) m.set(sig, groupKeyOf(f.group));
    }
    return m;
  }, [favorites]);

  // Grouping is computed from the filtered sets so empty groups vanish.
  // Named groups sort alphabetically; the Ungrouped catch-all goes last.
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    const bucket = (label: string): Group => {
      let b = map.get(label);
      if (!b) {
        b = { label, processes: [], favorites: [] };
        map.set(label, b);
      }
      return b;
    };
    for (const p of filteredProcesses) {
      bucket(groupKeyOf(p.group ?? sigGroup.get(favoriteSignature(p)))).processes.push(p);
    }
    for (const f of filteredFavorites) {
      bucket(groupKeyOf(f.group)).favorites.push(f);
    }
    return [...map.values()]
      .map((g) => ({
        label: g.label,
        // Processes keep the backend's push order (no auto-sorting); favorites
        // stay newest-first within a group.
        processes: g.processes,
        favorites: g.favorites.sort((a, b) => b.createdAt - a.createdAt),
      }))
      .sort((a, b) => {
        if (a.label === UNGROUPED) return 1;
        if (b.label === UNGROUPED) return -1;
        return a.label.localeCompare(b.label);
      });
  }, [filteredProcesses, filteredFavorites, sigGroup]);

  const hasAnything = processes.length > 0 || favorites.length > 0;

  // The Ungrouped catch-all is pinned in its own area above the scrolling
  // region, so it stays put while the named groups scroll underneath. When
  // it's the only group, it simply takes the full height.
  const ungrouped = groups.find((g) => g.label === UNGROUPED) ?? null;
  const grouped = groups.filter((g) => g.label !== UNGROUPED);

  const favActions = {
    onLaunch: onLaunchFavorite,
    onEdit: onEditFavorite,
    onRemove: onRemoveFavorite,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProcessFilterBar
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        nameFilter={nameFilter}
        onNameFilterChange={setNameFilter}
        shownCount={filteredProcesses.length}
        totalCount={processes.length}
        onImport={onImport}
      />

      {/* `@container` tracks each region's own width (not the viewport), so
          the grids collapse to one column when the log panel squeezes this
          side. */}
      {grouped.length > 0 ? (
        <>
          {ungrouped && (
            <div className="@container max-h-[50%] shrink-0 overflow-auto border-b p-4">
              <GroupSection
                g={ungrouped}
                defaultOpen={!collapsedLabels.has(ungrouped.label)}
                onOpenChange={(open) => toggleGroup(ungrouped.label, open)}
                selectedId={selectedId}
                unread={unread}
                favoritedSignatures={favoritedSignatures}
                actions={actions}
                favActions={favActions}
                onOpenFolder={onOpenFolder}
                onRemoveCategory={onRemoveCategory}
              />
            </div>
          )}
          <div className="@container min-h-0 flex-1 overflow-auto p-4">
            <div className="flex flex-col gap-4">
              {grouped.map((g) => (
                <GroupSection
                  key={g.label}
                  g={g}
                  defaultOpen={!collapsedLabels.has(g.label)}
                  onOpenChange={(open) => toggleGroup(g.label, open)}
                  selectedId={selectedId}
                  unread={unread}
                  favoritedSignatures={favoritedSignatures}
                  actions={actions}
                  favActions={favActions}
                  onOpenFolder={onOpenFolder}
                  onRemoveCategory={onRemoveCategory}
                />
              ))}
            </div>
          </div>
        </>
      ) : ungrouped ? (
        <div className="@container min-h-0 flex-1 overflow-auto p-4">
          <GroupSection
            g={ungrouped}
            defaultOpen={!collapsedLabels.has(ungrouped.label)}
            onOpenChange={(open) => toggleGroup(ungrouped.label, open)}
            selectedId={selectedId}
            unread={unread}
            favoritedSignatures={favoritedSignatures}
            actions={actions}
            favActions={favActions}
            onOpenFolder={onOpenFolder}
            onRemoveCategory={onRemoveCategory}
          />
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
        onConfirmDelete={confirmDelete}
        onConfirmStop={confirmStop}
        onDismissDelete={dismissDelete}
        onDismissStop={dismissStop}
      />
    </div>
  );
}
