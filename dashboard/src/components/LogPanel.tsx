import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/registry/default/ui/button";
import { Input } from "@/registry/default/ui/input";
import { Badge } from "@/registry/default/ui/badge";
import { ScrollArea } from "@/registry/default/ui/scroll-area";
import {
  ArrowDownToLineIcon,
  CircleOffIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  EraserIcon,
  FileTextIcon,
  FolderTreeIcon,
  ListOrderedIcon,
  PanelRightCloseIcon,
  SearchIcon,
  SquareTerminalIcon,
  XIcon,
  ClockIcon,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/registry/default/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@/registry/default/ui/menu";
import {
  downloadLogUrl,
  getLogFiles,
  getMergedLogs,
  getProcessCommand,
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
  const { t } = useTranslation();
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
  // Whether the view auto-scrolls to keep the latest line in sight. Pausing
  // lets the user scroll up to read older output while new logs stream in;
  // re-enabling snaps back to the bottom immediately.
  const [autoScroll, setAutoScroll] = useState(true);
  // The launch command shown in a top strip (built server-side incl. envs for
  // live processes; falls back to a public-field reconstruction when closed).
  const [command, setCommand] = useState<string | null>(null);
  // Set when the process is no longer live: shown as a 「进程已经关闭」 notice
  // instead of surfacing the raw "Process not found" error.
  const [closedNotice, setClosedNotice] = useState(false);

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
      onToast(t("logs.toastCopiedId", { id: process.id }));
    } catch {
      onToast(t("logs.toastCopyFailed"), true);
    }
  }

  // Clear the currently displayed log view (client-side only; does not erase
  // the backend history, so live tailing/search still work afterwards).
  function handleClearLogs() {
    setEntries([]);
    stickToBottom.current = true;
  }

  // Copy the currently displayed log text to the clipboard. Mirrors the Line
  // rendering (timestamp + optional stderr tag, line numbers excluded since
  // they're select-none) so the copied text matches what's on screen.
  async function handleCopyText() {
    if (entries.length === 0) {
      onToast(t("logs.toastNothingToCopy"));
      return;
    }
    const text = entries
      .map((e) => {
        const time = `[${formatTime(e.timestamp)}]`;
        const tag = e.stream === "stderr" ? ` [${e.stream}]` : "";
        return `${time}${tag} ${e.message}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      onToast(t("logs.toastCopiedLines", { count: entries.length }));
    } catch {
      onToast(t("logs.toastCopyFailed"), true);
    }
  }

  // Copy the on-disk log file locations. The browser can't know these paths,
  // so the backend supplies the absolute stdout/stderr file paths. For a
  // historical record written before paths were persisted, they may be null.
  async function handleCopyLocation() {
    try {
      const { stdoutPath, stderrPath } = await getLogFiles(process.id);
      const paths = [stdoutPath, stderrPath].filter(
        (p): p is string => !!p,
      );
      if (paths.length === 0) {
        onToast(t("logs.toastNoLogFile"), true);
        return;
      }
      await navigator.clipboard.writeText(paths.join("\n"));
      onToast(t("logs.toastCopiedLocation"));
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : t("logs.toastCopyFailed"),
        true,
      );
    }
  }

  // Download the merged on-disk log file (browser-native anchor download).
  function handleDownloadLog() {
    const a = document.createElement("a");
    a.href = downloadLogUrl(process.id);
    a.download = `${process.name}-${process.id}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
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

  // Re-enabling auto-scroll snaps the view back to the bottom right away and
  // restores the stick-to-bottom tracking that had been released on pause.
  useEffect(() => {
    if (!autoScroll) {
      stickToBottom.current = false;
      return;
    }
    stickToBottom.current = true;
    const el = viewport();
    if (el) el.scrollTop = el.scrollHeight;
  }, [autoScroll]);

  // Load merged history (both streams) whenever the process changes. Search is
  // reset because a grep is process-specific.
  useEffect(() => {
    let cancelled = false;
    const id = ++reqId.current;

    async function load() {
      setLoading(true);
      setError(null);
      setClosedNotice(false);
      try {
        const rows = await getMergedLogs(process.id, HISTORY_COUNT);
        if (cancelled || reqId.current !== id) return;
        setEntries(rows);
        stickToBottom.current = true;
      } catch (err) {
        if (cancelled || reqId.current !== id) return;
        const msg = err instanceof Error ? err.message : String(err);
        // A closed process's in-memory clients are gone; the backend may 404 or
        // (now) serve its on-disk logs. Either way, show a friendly notice
        // instead of the raw "Process not found" error. Genuine failures (e.g.
        // network) still surface via `error`.
        if (/Process not found/i.test(msg)) {
          setClosedNotice(true);
          setEntries([]);
        } else {
          setError(msg);
        }
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

  // Load the launch command for the command strip. Built server-side (cd to
  // cwd + env-var prefixes + `script args`). Works for any process that has
  // ever run: live includes envs; historical records omit them. On a true 404
  // (unknown id) we fall back to a best-effort display from the public fields.
  useEffect(() => {
    let cancelled = false;
    async function loadCommand() {
      try {
        const { command: cmd } = await getProcessCommand(process.id);
        if (!cancelled) setCommand(cmd);
      } catch {
        if (cancelled) return;
        // Backend can't build the full command (process gone / no envs). Build
        // a best-effort display from the always-present public fields.
        const parts = [process.script, ...process.args];
        const invocation = parts.join(" ");
        setCommand(
          process.cwd
            ? t("logs.commandIn", { cmd: invocation, cwd: process.cwd })
            : invocation,
        );
      }
    }
    void loadCommand();
    return () => {
      cancelled = true;
    };
  }, [process.id, process.script, process.args, process.cwd]);

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
    if (!autoScroll || !stickToBottom.current) return;
    const el = viewport();
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, autoScroll]);

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
              {t("logs.panelTitle", { name: process.name })}
            </h2>
            <div className="flex items-center gap-1.5">
              <p className="text-muted-foreground truncate font-mono text-xs">
                {process.id}
              </p>
              <button
                type="button"
                aria-label={t("logs.copyIdAria")}
                title={t("logs.copyIdTitle")}
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
              aria-label={t("logs.clearLogsAria")}
              title={t("logs.clearLogsTitle")}
              onClick={handleClearLogs}
            >
              <EraserIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("logs.collapseAria")}
              title={t("logs.collapseTitle")}
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
            placeholder={t("logs.searchPlaceholder")}
            className="h-8 pl-8 pr-8 text-xs"
          />
          {search && (
            <button
              type="button"
              aria-label={t("logs.clearSearch")}
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
                title={t("logs.filterByTerm", { term: f.term })}
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

      {/* Launch command strip: a compact, read-only display of how the process
          was started. Shown once the command resolves (live: full command with
          envs; closed: best-effort reconstruction from public fields). */}
      {command && (
        <Alert
          variant="info"
          className="shrink-0 gap-2 rounded-none border-x-0 border-t-0 px-4 py-2"
        >
          <SquareTerminalIcon className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <AlertTitle className="text-xs">{t("logs.commandLabel")}</AlertTitle>
            <AlertDescription className="text-foreground break-all font-mono text-xs">
              {command}
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* Log body: a themed "code block" surface that fills the remaining
          height. Uses bg-muted so it adapts to light/dark themes instead of a
          hardcoded black. The log-selectable class re-enables text selection
          (disabled app-wide) so users can copy log lines. */}
      <ScrollArea className="log-selectable bg-muted text-foreground min-h-0 flex-1">
        <div className="min-h-full p-4">
          {closedNotice && (
            <Alert variant="warning" className="mb-3">
              <CircleOffIcon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <AlertTitle>{t("logs.closedNoticeTitle")}</AlertTitle>
                <AlertDescription>
                  {t("logs.closedNoticeDesc")}
                </AlertDescription>
              </div>
            </Alert>
          )}
          {error ? (
            <pre className="m-0 whitespace-pre-wrap break-words text-xs leading-relaxed">
              <span className="text-destructive">{t("logs.errorPrefix", { message: error })}</span>
            </pre>
          ) : entries.length === 0 ? (
            <Empty className="min-h-[200px]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileTextIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {activeGrep ? t("logs.emptyNoMatches") : t("logs.emptyNoLogs")}
                </EmptyTitle>
                <EmptyDescription>
                  {activeGrep
                    ? t("logs.emptyNoMatchesDesc", { grep: activeGrep })
                    : t("logs.emptyNoLogsDesc")}
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

      {/* Footer toolbar: per-log view toggles + copy text (left), line count
          + overflow actions dropdown (right). */}
      <div className="flex shrink-0 items-center justify-between gap-1 border-t px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant={showTime ? "default" : "ghost"}
            aria-label={showTime ? t("logs.hideTimestamps") : t("logs.showTimestamps")}
            title={showTime ? t("logs.hideTimestamps") : t("logs.showTimestamps")}
            onClick={() => setShowTime((v) => !v)}
          >
            <ClockIcon />
          </Button>
          <Button
            size="icon-sm"
            variant={showLineNumbers ? "default" : "ghost"}
            aria-label={
              showLineNumbers ? t("logs.hideLineNumbers") : t("logs.showLineNumbers")
            }
            title={
              showLineNumbers ? t("logs.hideLineNumbers") : t("logs.showLineNumbers")
            }
            onClick={() => setShowLineNumbers((v) => !v)}
          >
            <ListOrderedIcon />
          </Button>
          <Button
            size="icon-sm"
            variant={autoScroll ? "default" : "ghost"}
            aria-pressed={autoScroll}
            aria-label={
              autoScroll ? t("logs.pauseAutoScroll") : t("logs.resumeAutoScroll")
            }
            title={
              autoScroll ? t("logs.pauseAutoScroll") : t("logs.resumeAutoScroll")
            }
            onClick={() => setAutoScroll((v) => !v)}
          >
            <ArrowDownToLineIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("logs.copyLogsAria")}
            title={t("logs.copyLogsTitle")}
            onClick={handleCopyText}
          >
            <CopyIcon />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground px-1 text-[11px] tabular-nums">
            {activeGrep
              ? searching
                ? t("logs.countSearching")
                : t("logs.countMatches", { count: entries.length })
              : loading
                ? t("logs.countLoading")
                : t("logs.countLines", { count: entries.length })}
          </span>
          <Menu>
            <MenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("logs.moreActions")}
                  title={t("logs.moreActions")}
                />
              }
            >
              <EllipsisVerticalIcon />
            </MenuTrigger>
            <MenuPopup>
              <MenuItem onClick={handleCopyLocation}>
                <FolderTreeIcon aria-hidden="true" />
                {t("logs.copyLocation")}
              </MenuItem>
              <MenuItem onClick={handleDownloadLog}>
                <DownloadIcon aria-hidden="true" />
                {t("logs.downloadLog")}
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
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
