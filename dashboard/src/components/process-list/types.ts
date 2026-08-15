import type { ProcessStatus, ProcessView } from "@/lib/types";
import type { Favorite } from "@/lib/favorites";

interface ProcessListProps {
  processes: ProcessView[];
  // Saved launch recipes merged into the same grouped list; each group section
  // shows its favorites next to the processes started from them.
  favorites: Favorite[];
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
  // Launch a favorite as a real process via the backend.
  onLaunchFavorite: (fav: Favorite) => void;
  // Open the favorite editor dialog on a favorite card.
  onEditFavorite: (fav: Favorite) => void;
  // Remove a favorite by id.
  onRemoveFavorite: (id: string) => void;
  // Open the folder-import dialog (scan a project dir for commands).
  onImport: () => void;
  // Open a group's folder in the OS file manager (group label is a path).
  onOpenFolder: (path: string) => void;
  // Delete every favorite in a group, given the ids of its items.
  onRemoveCategory: (ids: string[]) => void;
}

export type { ProcessListProps };

export type StatusFilter = "all" | ProcessStatus | "expired";

// Color dot shown before each status option. Mirrors StatusBadge semantics.
export const STATUS_DOT: Record<StatusFilter, string> = {
  all: "bg-muted-foreground/50",
  running: "bg-success",
  spawning: "bg-warning",
  exited: "bg-muted-foreground",
  error: "bg-destructive",
  expired: "bg-muted-foreground/30",
};

export const STATUS_OPTIONS: { value: StatusFilter; labelKey: string }[] = [
  { value: "all", labelKey: "processes.filterAll" },
  { value: "running", labelKey: "processes.filterRunning" },
  { value: "spawning", labelKey: "processes.filterSpawning" },
  { value: "exited", labelKey: "processes.filterExited" },
  { value: "error", labelKey: "processes.filterError" },
  { value: "expired", labelKey: "processes.filterExpired" },
];

// Bundled per-row action callbacks. Passed as a single object to the views
// and the shared context menu so call sites stay terse.
export interface RowActions {
  onSelectLogs: (p: ProcessView) => void;
  onView: (p: ProcessView) => void;
  onToggleFavorite: (p: ProcessView) => void;
  onRestart: (id: string) => void;
  onRequestStop: (p: ProcessView) => void;
  onRequestDelete: (p: ProcessView) => void;
  onCopyId: (p: ProcessView) => void;
  onCopyCommand: (p: ProcessView) => void;
}
