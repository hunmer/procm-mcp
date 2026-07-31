import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/registry/default/ui/button";
import { Input } from "@/registry/default/ui/input";
import { Badge } from "@/registry/default/ui/badge";
import { ScrollArea } from "@/registry/default/ui/scroll-area";
import {
  CopyIcon,
  EraserIcon,
  FileTextIcon,
  ListOrderedIcon,
  PanelRightCloseIcon,
  SearchIcon,
  XIcon,
  ClockIcon,
} from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import {
  getMergedLogs,
  grepMergedLogs,
  mergeEntries,
} from "@/lib/api";
import type {
  LogEntry,
  ProcessView,
  WsLogMessage,
} from "@/lib/types";

interface LogPanelProps {
  process: ProcessView;
  onClose: () => void;
  // Register a handler that receives live log lines for THIS process (the
  // parent already filters by the open process id before forwarding).
  onLiveLog: (cb: (m: WsLogMessage) => void) => void;
  onToast: (message: string, isError?: boolean) => void;
}

const HISTORY_COUNT = 100;
const GREP_COUNT = 500;

// Quick-filter keyword chips shown in the header. Clicking applies the term to
// the search box (regex grep over full log history). Variants mirror the
// severity color conventions.
const QUICK_FILTERS: {
  label: string;
  term: string;
  variant: React.ComponentProps<typeof Badge>["variant"];
}[] = [
  { label: "debug", term: "debug", variant: "secondary" },
  { label: "info", term: "info", variant: "info" },
  { label: "warn", term: "warn", variant: "warning" },
  { label: "error", term: "error", variant: "error" },
  { label: "fatal", term: "fatal", variant: "destructive" },
];

export function LogPanel({ process, onClose, onLiveLog, onToast }: LogPanelProps) {
  // Merged (stdout+stderr) chronological log lines.
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state: when non-empty, the panel shows grep results instead of the
  // live tail, and live appends are suspended.
  const [search, setSearch] = useState("");
  const [activeGrep, setActiveGrep] = useState("");
  const [searching, setSearching] = useState(false);
  // Whether the per-line timestamp is shown. Toggleable from the footer.
  const [showTime, setShowTime] = useState(true);
  // Whether a line-number badge is shown at the start of each row.
  const [showLineNumbers, setShowLineNumbers] = useState(false);

  const reqId = useRef(0);
  const asideRef = useRef<HTMLElement | null>(null);
  const stickToBottom = useRef(true);

  // The real scroll container is the ScrollArea Viewport.
  const viewport = () =>
    asideRef.current?.querySelector<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    ) ?? null;

  // Copy the process id to the clipboard.
  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(process.id);
      onToast(`Copied ID: ${process.id}`);
    } catch {
      onToast("Copy failed", true);
    }
  }

  // Clear the currently displayed log view (client-side only; does not erase
  // the backend history, so live tailing/search still work afterwards).
  function handleClearLogs() {
    setEntries([]);
    stickToBottom.current = true;
  }

  useEffect(() => {
    const el = viewport();
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Load merged history (both streams) whenever the process changes. Search is
  // reset because a grep is process-specific.
  useEffect(() => {
    let cancelled = false;
    const id = ++reqId.current;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getMergedLogs(process.id, HISTORY_COUNT);
        if (cancelled || reqId.current !== id) return;
        setEntries(rows);
        stickToBottom.current = true;
      } catch (err) {
        if (cancelled || reqId.current !== id) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled && reqId.current === id) setLoading(false);
      }
    }

    setEntries([]);
    setSearch("");
    setActiveGrep("");
    void load();
    return () => {
      cancelled = true;
    };
  }, [process.id]);

  // Receive live log lines (both streams) and append them, but only when not
  // showing search results. onLiveLog is a ref-registering API so calling it
  // during render is cheap and always points at fresh state.
  const searchingRef = useRef(false);
  searchingRef.current = activeGrep !== "";
  onLiveLog((m: WsLogMessage) => {
    if (m.processId !== process.id) return;
    if (searchingRef.current) return; // suspend live tail while viewing grep results
    setEntries((cur) =>
      mergeEntries(cur, [
        { timestamp: m.timestamp, stream: m.stream, message: m.message },
      ]),
    );
  });

  // Debounced grep: when the search input settles, run the backend grep across
  // both streams and show the merged results. Clears reload the recent tail.
  //
  // A ref tracks the search term currently reflected in the view, so we only
  // act when the intent actually changes. This deliberately does NOT depend on
  // `activeGrep` (the state we set here) — depending on it caused a redundant
  // second effect run after setActiveGrep, which raced with the reload and
  // could leave the panel stuck showing stale grep results after clearing.
  const appliedSearchRef = useRef("");
  useEffect(() => {
    const trimmed = search.trim();

    // Cleared: always reload the live tail (recent HISTORY_COUNT lines),
    // regardless of what was shown before. Runs immediately, no debounce.
    if (!trimmed) {
      if (appliedSearchRef.current === "") return; // already on the tail
      appliedSearchRef.current = "";
      setActiveGrep("");
      let cancelled = false;
      const id = ++reqId.current;
      (async () => {
        setLoading(true);
        try {
          const rows = await getMergedLogs(process.id, HISTORY_COUNT);
          if (cancelled || reqId.current !== id) return;
          setEntries(rows);
          stickToBottom.current = true;
        } catch {
          /* keep current view on error */
        } finally {
          if (!cancelled && reqId.current === id) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // New/changed search term: debounce, then grep both streams.
    const handle = setTimeout(() => {
      if (appliedSearchRef.current === trimmed) return; // already applied
      appliedSearchRef.current = trimmed;
      let cancelled = false;
      const id = ++reqId.current;
      setActiveGrep(trimmed);
      setSearching(true);
      (async () => {
        try {
          const rows = await grepMergedLogs(process.id, trimmed, false, GREP_COUNT);
          if (cancelled || reqId.current !== id) return;
          setEntries(rows);
          stickToBottom.current = true;
        } catch (err) {
          if (cancelled || reqId.current !== id) return;
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          if (!cancelled && reqId.current === id) setSearching(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, 350);
    return () => clearTimeout(handle);
  }, [search, process.id]);

  // Keep pinned to the latest line when new content arrives.
  useEffect(() => {
    if (!stickToBottom.current) return;
    const el = viewport();
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  // Decide whether to show the hour part. If any visible line is in a
  // different hour than the first one, show HH:mm:ss everywhere for a
  // consistent, scannable column; otherwise just mm:ss.
  const showHours = useMemo(() => {
    if (entries.length < 2) return false;
    const firstHour = new Date(entries[0].timestamp).getHours();
    return entries.some((e) => new Date(e.timestamp).getHours() !== firstHour);
  }, [entries]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return showHours ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  return (
    <aside
      ref={asideRef}
      className="bg-card flex h-full min-w-0 flex-col overflow-hidden rounded-xl border"
    >
      <header className="flex shrink-0 flex-col gap-3 border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              Logs: {process.name}
            </h2>
            <div className="flex items-center gap-1.5">
              <p className="text-muted-foreground truncate font-mono text-xs">
                {process.id}
              </p>
              <button
                type="button"
                aria-label="Copy process ID"
                title="Copy ID"
                onClick={handleCopyId}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <CopyIcon className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Clear displayed logs"
              title="Clear logs"
              onClick={handleClearLogs}
            >
              <EraserIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Collapse log panel"
              title="Collapse"
              onClick={onClose}
            >
              <PanelRightCloseIcon />
            </Button>
          </div>
        </div>

        {/* Search: queries the backend's full log history (both streams) via
            the /logs?grep= route. While active, live tailing is suspended. */}
        <div className="relative">
          <SearchIcon className="text-foreground/50 pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search full log history (regex)…"
            className="h-8 pl-8 pr-8 text-xs"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>

        {/* Quick-filter keywords: click to drop the term into the search box
            (grep is regex, these are plain words so they match literally). */}
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_FILTERS.map((f) => {
            const active = search.trim() === f.term;
            return (
              <button
                key={f.term}
                type="button"
                onClick={() => setSearch(active ? "" : f.term)}
                title={`Filter by “${f.term}”`}
                aria-pressed={active}
              >
                <Badge
                  variant={active ? "default" : f.variant}
                  size="sm"
                  className="cursor-pointer"
                >
                  {f.label}
                </Badge>
              </button>
            );
          })}
        </div>
      </header>

      {/* Log body: a themed "code block" surface that fills the remaining
          height. Uses bg-muted so it adapts to light/dark themes instead of a
          hardcoded black. The log-selectable class re-enables text selection
          (disabled app-wide) so users can copy log lines. */}
      <ScrollArea className="log-selectable bg-muted text-foreground min-h-0 flex-1">
        <div className="min-h-full p-4">
          {error ? (
            <pre className="m-0 whitespace-pre-wrap break-words text-xs leading-relaxed">
              <span className="text-destructive">error: {error}</span>
            </pre>
          ) : entries.length === 0 ? (
            <Empty className="min-h-[200px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileTextIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {activeGrep ? "No matches" : "No logs yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {activeGrep
                    ? `Nothing matches “${activeGrep}”.`
                    : "Log output will appear here in real time."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <pre className="m-0 whitespace-pre-wrap break-words text-xs leading-relaxed">
              {entries.map((e, i) => (
                <Line
                  key={i}
                  index={i}
                  entry={e}
                  showTime={showTime}
                  showLineNumbers={showLineNumbers}
                  formatTime={formatTime}
                />
              ))}
            </pre>
          )}
        </div>
      </ScrollArea>

      {/* Footer toolbar: per-log view toggles (left) + line count (right). */}
      <div className="flex shrink-0 items-center justify-between gap-1 border-t px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant={showTime ? "default" : "ghost"}
            aria-label={showTime ? "Hide timestamps" : "Show timestamps"}
            title={showTime ? "Hide timestamps" : "Show timestamps"}
            onClick={() => setShowTime((v) => !v)}
          >
            <ClockIcon />
          </Button>
          <Button
            size="icon-sm"
            variant={showLineNumbers ? "default" : "ghost"}
            aria-label={
              showLineNumbers ? "Hide line numbers" : "Show line numbers"
            }
            title={
              showLineNumbers ? "Hide line numbers" : "Show line numbers"
            }
            onClick={() => setShowLineNumbers((v) => !v)}
          >
            <ListOrderedIcon />
          </Button>
        </div>
        <span className="text-muted-foreground px-1 text-[11px] tabular-nums">
          {activeGrep
            ? searching
              ? "searching…"
              : `${entries.length} match${entries.length === 1 ? "" : "es"}`
            : loading
              ? "loading…"
              : `${entries.length} line${entries.length === 1 ? "" : "s"}`}
        </span>
      </div>
    </aside>
  );
}

// A single rendered log line. stderr is highlighted in red so the merged view
// still distinguishes the two streams at a glance. The timestamp prefix is
// optional (toggleable) and bracketed; an optional non-copyable line-number
// badge can lead each row.
function Line({
  entry,
  index,
  showTime,
  showLineNumbers,
  formatTime,
}: {
  entry: LogEntry;
  index: number;
  showTime: boolean;
  showLineNumbers: boolean;
  formatTime: (ts: number) => string;
}) {
  const isErr = entry.stream === "stderr";
  return (
    <span>
      {showLineNumbers && (
        // Non-copyable line-number badge (user-select: none) so selecting log
        // text doesn't drag the numbers along.
        <span className="text-muted-foreground/60 select-none mr-2 font-mono tabular-nums">
          {String(index + 1).padStart(3, " ")}
        </span>
      )}
      {showTime && (
        <span className="text-muted-foreground">[{formatTime(entry.timestamp)}] </span>
      )}
      {isErr && (
        <span className="text-destructive">[{entry.stream}] </span>
      )}
      <span className={isErr ? "text-destructive" : "text-foreground"}>
        {entry.message}
      </span>
      {"\n"}
    </span>
  );
}
