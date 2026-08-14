import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/registry/default/ui/button";
import { Input } from "@/registry/default/ui/input";
import { Textarea } from "@/registry/default/ui/textarea";
import { Badge } from "@/registry/default/ui/badge";
import { ScrollArea } from "@/registry/default/ui/scroll-area";
import { Separator } from "@/registry/default/ui/separator";
import {
  CircleOffIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  EllipsisVerticalIcon,
  EraserIcon,
  FileTextIcon,
  FolderTreeIcon,
  PanelRightCloseIcon,
  PlayIcon,
  RotateCwIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  SquareIcon,
  TerminalIcon,
  SquareTerminalIcon,
  XIcon,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/registry/default/ui/alert";
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
  MenuSeparator,
  MenuTrigger,
} from "@/registry/default/ui/menu";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@/registry/default/ui/popover";
import { Checkbox } from "@/registry/default/ui/checkbox";
import { Slider } from "@/registry/default/ui/slider";
import {
  downloadLogUrl,
  getLogFiles,
  getMergedLogs,
  getProcessCommand,
  grepMergedLogs,
  mergeEntries,
  restartProcess,
  sendProcessInput,
  stopProcess,
} from "@/lib/api";
import type {
  LogEntry,
  ProcessView,
  WsLogMessage,
} from "@/lib/types";
import { TerminalLog, stripAnsi } from "./TerminalLog";

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

// Structured-level filters shown as a compact segmented control. Legacy plain
// lines remain visible under "all" while exact levels show SDK Logger entries.
const LEVEL_FILTERS: {
  label: string;
  level: "all" | "debug" | "info" | "warn" | "error";
  variant: React.ComponentProps<typeof Badge>["variant"];
}[] = [
  { label: "all", level: "all", variant: "outline" },
  { label: "debug", level: "debug", variant: "secondary" },
  { label: "info", level: "info", variant: "info" },
  { label: "warn", level: "warn", variant: "warning" },
  { label: "error", level: "error", variant: "error" },
];

export function LogPanel({ process, onClose, onLiveLog, onToast }: LogPanelProps) {
  const { t } = useTranslation();
  // Merged (stdout+stderr) chronological log lines.
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<(typeof LEVEL_FILTERS)[number]["level"]>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state: when non-empty, the panel shows grep results instead of the
  // live tail, and live appends are suspended.
  const [search, setSearch] = useState("");
  const [activeGrep, setActiveGrep] = useState("");
  const [searching, setSearching] = useState(false);
  // Trailing context lines shown after each grep match. Driven by the slider
  // that appears under the search box while search results are displayed.
  const [afterContext, setAfterContext] = useState(0);
  // Whether the per-line timestamp is shown. Toggleable from the footer.
  const [showTime, setShowTime] = useState(true);
  // Whether a line-number badge is shown at the start of each row.
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  // Whether the view auto-scrolls to keep the latest line in sight. Pausing
  // lets the user scroll up to read older output while new logs stream in;
  // re-enabling snaps back to the bottom immediately.
  const [autoScroll, setAutoScroll] = useState(true);
  // Log body font size, driven from the view-settings popover. The default
  // ("xs") matches the previous hardcoded text-xs scale.
  const [fontSize, setFontSize] = useState<"xs" | "sm" | "md">("xs");
  const fontTextClass =
    fontSize === "xs" ? "text-xs" : fontSize === "sm" ? "text-sm" : "text-base";
  const fontLineClass = fontSize === "xs" ? "leading-relaxed" : "leading-normal";
  // The launch command shown in a top strip (built server-side incl. envs for
  // live processes; falls back to a public-field reconstruction when closed).
  const [command, setCommand] = useState<string | null>(null);
  // Set when the process is no longer live: shown as a 「进程已经关闭」 notice
  // instead of surfacing the raw "Process not found" error.
  const [closedNotice, setClosedNotice] = useState(false);
  // Whether the stop confirmation dialog is open. Restart/run fire directly,
  // but stop (which keeps the record) is gated behind a confirm — mirroring
  // the ProcessList behavior.
  const [pendingStop, setPendingStop] = useState(false);
  // Stdin input bar: text typed here is written to the process's stdin on
  // submit (Enter or Send button). Only meaningful for a running process with
  // a live stdin, so the bar is hidden when !canStop.
  const [stdinValue, setStdinValue] = useState("");
  // Whether the stdin input bar is shown. Hidden by default and toggled from
  // the footer so the log view stays uncluttered unless the user wants to write.
  const [showStdin, setShowStdin] = useState(false);
  // Sending-in-flight guard so the input can't be double-submitted while a
  // write is pending (prevents duplicate lines from a fast double-Enter).
  const [sendingInput, setSendingInput] = useState(false);

  // Whether the process can currently be stopped — mirrors the same check in
  // ProcessList (running/spawning only). When it can't be stopped, the footer
  // shows a Play button to restart instead.
  const canStop =
    process.stoppedAt == null &&
    process.status !== "exited" &&
    process.status !== "error";

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

  // Restart the process. The WebSocket push refreshes the process view (and
  // thus `canStop`/status), and the load effect re-runs on pid change to swap
  // in the new run's logs.
  async function handleRestart() {
    try {
      await restartProcess(process.id);
      onToast(t("logs.toastRestarted", { id: process.id }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  // Open the stop confirmation dialog. Defensive guard against the same
  // canStop check so a stale click on a row that just stopped is a no-op.
  function requestStop() {
    if (!canStop) return;
    setPendingStop(true);
  }

  // Actually stop the process (keeps its record as history).
  async function confirmStop() {
    setPendingStop(false);
    try {
      await stopProcess(process.id);
      onToast(t("logs.toastStopped", { name: process.name }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  // Submit the stdin input bar: write the current value to the process's
  // stdin (newline appended so the child reads it as a complete line). Clears
  // the box on success. Errors surface via toast — the backend returns a
  // descriptive message (e.g. "no writable stdin") which the api() wrapper
  // turns into a thrown Error.
  async function handleSendInput() {
    const value = stdinValue;
    if (!value || sendingInput) return;
    setSendingInput(true);
    try {
      const res = await sendProcessInput(process.id, { text: value, newline: true });
      onToast(t("logs.toastInputSent", { bytes: res.bytes ?? 0 }));
      setStdinValue("");
    } catch (err) {
      onToast(
        t("logs.toastInputFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
        true,
      );
    } finally {
      setSendingInput(false);
    }
  }

  // Append a snippet to the stdin box (used by the snippets dropdown next to
  // the input). Plain text is appended in place; signals are sent immediately
  // since they don't belong on stdin.
  function appendSnippet(text: string) {
    setStdinValue((v) => (v ? `${v}${text}` : text));
  }
  async function sendSignal(signal: string, label: string) {
    try {
      await sendProcessInput(process.id, { signal });
      onToast(t("logs.toastSignalSent", { signal: label }));
    } catch (err) {
      onToast(
        t("logs.toastInputFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
        true,
      );
    }
  }

  // Copy the currently displayed log text to the clipboard. Mirrors the Line
  // rendering (timestamp + optional stderr tag, line numbers excluded since
  // they're select-none) so the copied text matches what's on screen.
  async function handleCopyText() {
    if (visibleEntries.length === 0) {
      onToast(t("logs.toastNothingToCopy"));
      return;
    }
    const text = visibleEntries
      .map((e) => {
        const time = `[${formatTime(e.timestamp)}]`;
        const tag = e.stream === "stderr" ? ` [${e.stream}]` : "";
        // Strip ANSI escapes so the clipboard gets clean text instead of raw
        // escape codes.
        return `${time}${tag} ${stripAnsi(e.message)}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      onToast(t("logs.toastCopiedLines", { count: visibleEntries.length }));
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
  // reset because a grep is process-specific. Also re-runs on restart: the id
  // stays the same but lastStartedAt changes. Keep pid as a fallback for older
  // backends that do not expose lastStartedAt yet. The new run has fresh
  // in-memory clients, so getMergedLogs returns its own (initially empty)
  // history instead of the stopped run's on-disk logs.
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
    setAfterContext(0);
    void load();
    return () => {
      cancelled = true;
    };
  }, [process.id, process.lastStartedAt, process.pid]);

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
        { timestamp: m.timestamp, stream: m.stream, message: m.message, level: m.level, memberId: m.memberId, clientName: m.clientName, data: m.data },
      ]),
    );
  });

  // Debounced grep: when the search input settles, run the backend grep across
  // both streams and show the merged results. Clears reload the recent tail.
  //
  // A ref tracks the "term|after" key currently reflected in the view, so we
  // only act when the intent actually changes — covering both a new search
  // term and a changed context-lines slider. This deliberately does NOT depend
  // on `activeGrep` (the state we set here) — depending on it caused a
  // redundant second effect run after setActiveGrep, which raced with the
  // reload and could leave the panel stuck showing stale grep results after
  // clearing.
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

    // New/changed search term OR context-lines value: debounce, then grep
    // both streams (with the current after-context count).
    const key = `${trimmed}|${afterContext}`;
    const handle = setTimeout(() => {
      if (appliedSearchRef.current === key) return; // already applied
      appliedSearchRef.current = key;
      let cancelled = false;
      const id = ++reqId.current;
      setActiveGrep(trimmed);
      setSearching(true);
      (async () => {
        try {
          const rows = await grepMergedLogs(
            process.id,
            trimmed,
            false,
            GREP_COUNT,
            afterContext,
          );
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
  }, [search, process.id, afterContext]);

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
  const visibleEntries = useMemo(
    () => levelFilter === "all" ? entries : entries.filter((entry) => entry.level === levelFilter),
    [entries, levelFilter],
  );

  // Regex used to highlight the active search term in displayed lines. Same
  // compile rules as the backend grep: try the term as a regex, fall back to
  // an escaped literal match on parse failure. Null when no search is active.
  const highlightRegex = useMemo(() => {
    const term = activeGrep.trim();
    if (!term) return null;
    try {
      return new RegExp(term, "g");
    } catch {
      return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    }
  }, [activeGrep]);

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
      className="flex h-full min-w-0 flex-col overflow-hidden"
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
            {/* Run (restart) button: only shown when the process can't be
                stopped (stopped/exited/error), so a closed process can be
                relaunched straight from its panel header. */}
            {!canStop && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("logs.runAria", { name: process.name })}
                title={t("logs.runTitle")}
                onClick={handleRestart}
                className="text-muted-foreground hover:text-success"
              >
                <PlayIcon />
              </Button>
            )}
           
            {/* Process controls pulled into the header so the open process
                can be restarted / stopped without scrolling to the toolbar.
                Mirrors the ProcessList row actions. */}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("logs.restartAria", { name: process.name })}
              title={t("logs.restartTitle")}
              onClick={handleRestart}
              className="text-muted-foreground hover:text-success"
            >
              <RotateCwIcon />
            </Button>
            {canStop && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("logs.stopAria", { name: process.name })}
                title={t("logs.stopTitle")}
                onClick={requestStop}
                className="text-muted-foreground hover:text-warning"
              >
                <SquareIcon />
              </Button>
            )}
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

        {/* Context-lines slider: only relevant while viewing search results.
            Controls how many trailing lines are shown after each match; moving
            it re-runs the debounced grep with the new after-context count. */}
        {activeGrep && !searching && entries.length > 0 && (
          <div className="flex items-center gap-2 px-0.5">
            <span className="text-muted-foreground w-20 shrink-0 text-xs">
              {t("logs.contextAfter")}
            </span>
            <Slider
              value={afterContext}
              onValueChange={(v) =>
                setAfterContext(Array.isArray(v) ? v[0] : (v as number))
              }
              min={0}
              max={10}
              aria-label={t("logs.contextAfter")}
              className="flex-1"
            />
            <span className="text-muted-foreground w-6 shrink-0 text-right text-xs tabular-nums">
              {afterContext}
            </span>
          </div>
        )}

        {/* Quick-filter keywords: click to drop the term into the search box
            (grep is regex, these are plain words so they match literally). */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Log level">
          {LEVEL_FILTERS.map((f) => {
            const active = levelFilter === f.level;
            return (
              <button
                key={f.level}
                type="button"
                onClick={() => setLevelFilter(f.level)}
                title={t("logs.filterByTerm", { term: f.label })}
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
          {/* View settings: a popover (stays open while toggling) holding the
              per-log view toggles + font-size picker, collapsed behind a gear
              so the quick-filter row stays compact. ms-auto pins it to the far
              right of the quick-filter row even when the chips wrap. */}
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="ms-auto"
                  aria-label={t("logs.viewSettingsAria")}
                  title={t("logs.viewSettingsTitle")}
                />
              }
            >
              <SettingsIcon />
            </PopoverTrigger>
            <PopoverPopup className="w-60">
              {/* Toggles: timestamps, line numbers, auto-scroll. */}
              <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <Checkbox
                  checked={showTime}
                  onCheckedChange={(v) => setShowTime(v)}
                />
                {t("logs.timestampsOption")}
              </label>
              <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <Checkbox
                  checked={showLineNumbers}
                  onCheckedChange={(v) => setShowLineNumbers(v)}
                />
                {t("logs.lineNumbersOption")}
              </label>
              <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <Checkbox
                  checked={autoScroll}
                  onCheckedChange={(v) => setAutoScroll(v)}
                />
                {t("logs.autoScrollOption")}
              </label>
              <Separator className="my-1" />
              {/* Font size: segmented pick of small / medium / large. */}
              <div className="px-1 pb-1">
                <span className="text-muted-foreground px-1 text-xs">
                  {t("logs.fontSizeOption")}
                </span>
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  {(["xs", "sm", "md"] as const).map((size, i) => (
                    <Button
                      key={size}
                      size="xs"
                      variant={fontSize === size ? "default" : "outline"}
                      aria-pressed={fontSize === size}
                      onClick={() => setFontSize(size)}
                    >
                      {[
                        t("logs.fontSizeSmall"),
                        t("logs.fontSizeMedium"),
                        t("logs.fontSizeLarge"),
                      ][i]}
                    </Button>
                  ))}
                </div>
              </div>
            </PopoverPopup>
          </Popover>
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
      {/* Log body: a dark "terminal" surface so the ANSI color palette renders
          with the contrast its authors intended (mirrors the embedded-terminal
          convention used by VS Code / xterm). The log-selectable class
          re-enables text selection (disabled app-wide) so users can copy lines. */}
      <ScrollArea className="log-selectable bg-zinc-950 text-zinc-300 min-h-0 flex-1">
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
            <pre className={`m-0 whitespace-pre-wrap break-words ${fontTextClass} ${fontLineClass}`}>
              <span className="text-red-400">{t("logs.errorPrefix", { message: error })}</span>
            </pre>
          ) : visibleEntries.length === 0 ? (
            <Empty className="min-h-[200px] text-zinc-400">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-zinc-800 text-zinc-400">
                  <FileTextIcon />
                </EmptyMedia>
                <EmptyTitle className="text-zinc-300">
                  {activeGrep ? t("logs.emptyNoMatches") : t("logs.emptyNoLogs")}
                </EmptyTitle>
                <EmptyDescription className="text-zinc-500">
                  {activeGrep
                    ? t("logs.emptyNoMatchesDesc", { grep: activeGrep })
                    : t("logs.emptyNoLogsDesc")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <TerminalLog
              entries={visibleEntries}
              showTime={showTime}
              showLineNumbers={showLineNumbers}
              formatTime={formatTime}
              highlight={highlightRegex}
              className={`${fontTextClass} ${fontLineClass}`}
            />
          )}
        </div>
      </ScrollArea>

      {/* Stdin input bar: write text directly to the process's standard input.
          Shown only while the process is live (canStop) AND the user has
          toggled the bar on from the footer (hidden by default so the log view
          stays uncluttered). Uses an auto-sizing textarea (field-sizing-content
          grows with input). Enter submits; Shift+Enter inserts a newline. The
          dots menu inserts common snippets / signals. */}
      {canStop && showStdin && (
        <div className="flex shrink-0 items-end gap-1.5 border-t px-2 py-1.5">
          <Textarea
            size="sm"
            value={stdinValue}
            onChange={(e) => setStdinValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSendInput();
              }
            }}
            placeholder={t("logs.inputPlaceholder")}
            disabled={sendingInput}
            rows={1}
            className="max-h-40 text-xs"
          />
          {/* Snippets dropdown: insert common stdin snippets or deliver an OS
              signal (Ctrl+C / Ctrl+D / SIGTERM / SIGHUP). Plain text is
              appended to the box; signals are sent immediately. */}
          <Menu>
            <MenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("logs.snippetsAria")}
                  title={t("logs.snippetsTitle")}
                  className="shrink-0"
                />
              }
            >
              <EllipsisIcon />
            </MenuTrigger>
            <MenuPopup>
              <MenuItem
                onClick={() => sendSignal("SIGINT", t("logs.snippetCtrlC"))}
              >
                <SquareTerminalIcon aria-hidden="true" />
                {t("logs.snippetCtrlC")}
              </MenuItem>
              <MenuItem
                onClick={() => sendSignal("SIGTERM", t("logs.snippetSigterm"))}
              >
                <SquareTerminalIcon aria-hidden="true" />
                {t("logs.snippetSigterm")}
              </MenuItem>
              <MenuItem
                onClick={() => sendSignal("SIGHUP", t("logs.snippetSighup"))}
              >
                <SquareTerminalIcon aria-hidden="true" />
                {t("logs.snippetSighup")}
              </MenuItem>
              <MenuItem onClick={() => appendSnippet("\u0004")}>
                {t("logs.snippetCtrlD")}
              </MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => appendSnippet("\n")}>
                {t("logs.snippetNewline")}
              </MenuItem>
              <MenuItem onClick={() => appendSnippet("yes")}>
                {t("logs.snippetYes")}
              </MenuItem>
              <MenuItem onClick={() => appendSnippet("no")}>
                {t("logs.snippetNo")}
              </MenuItem>
              <MenuItem onClick={() => appendSnippet("exit")}>
                {t("logs.snippetExit")}
              </MenuItem>
              <MenuItem onClick={() => appendSnippet("clear")}>
                {t("logs.snippetClear")}
              </MenuItem>
            </MenuPopup>
          </Menu>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("logs.sendAria", { name: process.name })}
            title={t("logs.sendTitle")}
            onClick={handleSendInput}
            disabled={sendingInput || !stdinValue}
            className="shrink-0"
          >
            <SendIcon />
          </Button>
        </div>
      )}

      {/* Footer toolbar: per-log view toggles + copy text (left), line count
          + overflow actions dropdown (right). */}
      <div className="flex shrink-0 items-center justify-between gap-1 border-t px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("logs.copyLogsAria")}
            title={t("logs.copyLogsTitle")}
            onClick={handleCopyText}
          >
            <CopyIcon />
          </Button>
          {/* Clear-view button. Ctrl+C and other signals moved to the stdin
              bar's snippets menu. */}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("logs.clearLogsAria")}
            title={t("logs.clearLogsTitle")}
            onClick={handleClearLogs}
          >
            <EraserIcon />
          </Button>
          {/* Toggle the stdin input bar (only meaningful for a live process).
              Hidden by default so the log view stays uncluttered; the active
              variant shows when input is on. */}
          {canStop && (
            <Button
              size="icon-sm"
              variant={showStdin ? "default" : "ghost"}
              aria-pressed={showStdin}
              aria-label={t("logs.toggleStdinAria")}
              title={
                showStdin ? t("logs.hideStdin") : t("logs.showStdin")
              }
              onClick={() => setShowStdin((v) => !v)}
            >
              <TerminalIcon />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground px-1 text-[11px] tabular-nums">
            {activeGrep
              ? searching
                ? t("logs.countSearching")
                : t("logs.countMatches", { count: entries.length })
              : loading
                ? t("logs.countLoading")
                : t("logs.countLines", { count: visibleEntries.length })}
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

      {/* Stop confirmation: triggered from the footer Stop button. Stopping
          keeps the record (and its on-disk logs) as history. */}
      <AlertDialog
        open={pendingStop}
        onOpenChange={(open) => {
          if (!open) setPendingStop(false);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("logs.stopQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("logs.stopDescription", { name: process.name, id: process.id })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={confirmStop}
            >
              {t("common.stop")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </aside>
  );
}
