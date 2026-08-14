import type { ProcessStatus, ProcessView } from "@/lib/types";

interface ProcessListProps {
  processes: ProcessView[];
  selectedId: string | null;
  // Wall-clock "now" (epoch ms) that ticks every second from the parent, so the
  // uptime column stays live without this component owning its own timer.
  now: number;
  // Per-process unread log counts, keyed by process id.
  unread: Record<string, number>;
  // Set of favorited launch signatures, so rows show the filled star.
  favoritedSignatures: Set<string>;
  // Toggle favorite for a process: open the favorite dialog when adding.
  onToggleFavorite: (p: ProcessView) => void;
  onSelectLogs: (p: ProcessView) => void;
  onView: (p: ProcessView) => void;
  onToast: (message: string, isError?: boolean) => void;
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

export const PAGE_SIZE = 8;

// Layout toggle for the process list: "table" (rows) or "cards" (grid).
export type ViewMode = "table" | "cards";
export const VIEW_KEY = "procm.processView";

// Bundled per-row action callbacks. Passed as a single object to the views,
// the columns hook, and the shared context menu so call sites stay terse.
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
