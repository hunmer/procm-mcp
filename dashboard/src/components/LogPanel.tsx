import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  clearProcessLogs,
  downloadLogUrl,
  getLogFiles,
  getMergedLogs,
  getProcessCommand,
  grepMergedLogs,
  mergeEntries,
  restartProcess,
  revealPath,
  sendProcessInput,
  stopProcess,
} from "@/lib/api";
import type {
  LogEntry,
  ProcessView,
  WsLogMessage,
  WsLogClearedMessage,
} from "@/lib/types";
import { stripAnsi } from "./TerminalLog";
import {
  GREP_COUNT,
  HISTORY_COUNT,
} from "./log-panel/constants";
import { LogPanelHeader } from "./log-panel/LogPanelHeader";
import { LogPanelCommandStrip } from "./log-panel/LogPanelCommandStrip";
import { LogPanelBody } from "./log-panel/LogPanelBody";
import { LogPanelStdinBar } from "./log-panel/LogPanelStdinBar";
import { LogPanelFooter } from "./log-panel/LogPanelFooter";
import { LogPanelStopDialog } from "./log-panel/LogPanelStopDialog";
import type { LevelFilter } from "./log-panel/types";
import { useLogPanelViewState } from "./log-panel/useLogPanelViewState";

interface LogPanelProps {
  process: ProcessView;
  /** Supply externally managed entries for room-level logs. */
  entries?: LogEntry[];
  roomMode?: boolean;
  onClose: () => void;
  // Register a handler that receives live log lines for THIS process (the
  // parent already filters by the open process id before forwarding).
  onLiveLog: (cb: (m: WsLogMessage | WsLogClearedMessage) => void) => void;
  onToast: (message: string, isError?: boolean) => void;
}

// Orchestrator for the per-process log panel: owns all state (entries,
// search, view toggles, stdin, stop dialog) and data loading, and composes
// the presentational sub-components from ./log-panel/.
export function LogPanel({ process, entries: externalEntries, roomMode = false, onClose, onLiveLog, onToast }: LogPanelProps) {
  const { t } = useTranslation();
  // Merged (stdout+stderr) chronological log lines.
  const [entries, setEntries] = useState<LogEntry[]>([]);
  useEffect(() => {
    if (externalEntries) setEntries(externalEntries);
  }, [externalEntries]);
  // Checked levels in the quick filter. Empty set = show every line.
  const view = useLogPanelViewState(entries);
  const { selectedLevels, setSelectedLevels, selectedDevices, setSelectedDevices, devices, visibleEntries, levelCounts, deviceCounts, showTime, setShowTime, showLineNumbers, setShowLineNumbers, showJson, setShowJson, colorizeBackground, setColorizeBackground, autoScroll, setAutoScroll, fontSize, setFontSize } = view;
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
  // Whether the view auto-scrolls to keep the latest line in sight. Pausing
  // lets the user scroll up to read older output while new logs stream in;
  // re-enabling snaps back to the bottom immediately.
  // Log body font size, driven from the view-settings popover. The default
  // ("xs") matches the previous hardcoded text-xs scale.
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

  // Clear this process's stdout/stderr history on the server, then reset the
  // panel to the empty live-tail view. Keep the current view when it fails.
  async function handleClearLogs() {
    if (roomMode) return;
    try {
      await clearProcessLogs(process.id);
      reqId.current++;
      appliedSearchRef.current = "";
      setSearch("");
      setActiveGrep("");
      setEntries([]);
      setError(null);
      stickToBottom.current = true;
      onToast(t("logs.toastLogsCleared"));
    } catch (err) {
      onToast(
        t("logs.toastClearFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
        true,
      );
    }
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

  // Build the currently displayed log text for the footer's copy button
  // (clipboard write + anchored toast live in CopyIconButton). Mirrors the Line
  // rendering (timestamp + optional stderr tag, line numbers excluded since
  // they're select-none) so the copied text matches what's on screen. Null
  // when nothing is visible — the button then shows a "nothing to copy" toast.
  function getCopyText(): string | null {
    if (visibleEntries.length === 0) return null;
    return visibleEntries
      .map((e) => {
        const time = `[${formatTime(e.timestamp)}]`;
        const tag = e.stream === "stderr" ? ` [${e.stream}]` : "";
        // Strip ANSI escapes so the clipboard gets clean text instead of raw
        // escape codes.
        return `${time}${tag} ${stripAnsi(e.message)}`;
      })
      .join("\n");
  }

  // Copy the on-disk log file locations. The browser can't know these paths,
  // so the backend supplies the absolute stdout/stderr file paths. For a
  // historical record written before paths were persisted, they may be null.
  async function handleCopyLocation() {
    if (roomMode) return;
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

  // Reveal the process's stdout log file in the OS file manager (the panel is
  // a merged view, so the stdout file — the primary stream — is the target;
  // falls back to stderr when there is no stdout file). Like the copy action,
  // paths come from the backend since the browser can't know them.
  async function handleRevealLogFile() {
    if (roomMode) return;
    try {
      const { stdoutPath, stderrPath } = await getLogFiles(process.id);
      const target = stdoutPath ?? stderrPath;
      if (!target) {
        onToast(t("logs.toastNoLogFile"), true);
        return;
      }
      await revealPath(target);
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : t("logs.toastCopyFailed"),
        true,
      );
    }
  }

  // Download the merged on-disk log file (browser-native anchor download).
  function handleDownloadLog() {
    if (roomMode) return;
    const a = document.createElement("a");
    a.href = downloadLogUrl(process.id);
    a.download = `${process.name}-${process.id}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  useEffect(() => {
    if (roomMode) {
      setEntries(externalEntries ?? []);
      setLoading(false);
      return;
    }
    const el = viewport();
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Ctrl/Cmd+F focuses the search box while the panel is open, overriding the
  // browser's own find bar. The header's search input is the only <input>
  // inside the panel's <header>.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
      const input = asideRef.current?.querySelector<HTMLInputElement>(
        "header input",
      );
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
    if (roomMode) {
      setClosedNotice(false);
      setEntries(externalEntries ?? []);
      setLoading(false);
      return;
    }
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
  }, [process.id, process.lastStartedAt, process.pid, roomMode, externalEntries]);

  // Load the launch command for the command strip. Built server-side (cd to
  // cwd + env-var prefixes + `script args`). Works for any process that has
  // ever run: live includes envs; historical records omit them. On a true 404
  // (unknown id) we fall back to a best-effort display from the public fields.
  useEffect(() => {
    if (roomMode) {
      setCommand(null);
      return;
    }
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
  }, [process.id, process.script, process.args, process.cwd, roomMode]);

  // Receive live log lines (both streams) and append them, but only when not
  // showing search results. onLiveLog is a ref-registering API so calling it
  // during render is cheap and always points at fresh state.
  const searchingRef = useRef(false);
  searchingRef.current = activeGrep !== "";
  onLiveLog((m: WsLogMessage | WsLogClearedMessage) => {
    if (m.processId !== process.id) return;
    if (m.type === "logCleared") {
      reqId.current++;
      appliedSearchRef.current = "";
      setSearch("");
      setActiveGrep("");
      setEntries([]);
      setError(null);
      stickToBottom.current = true;
      return;
    }
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
    if (roomMode) return;
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
  }, [search, process.id, afterContext, roomMode]);

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

  // Per-level counts for the quick-filter badges, computed over the full
  // (unfiltered) entry list so they stay accurate while a filter is active.
  // Toggle one level checkbox in the quick filter.
  const toggleLevel = (level: LevelFilter) => {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

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
      <LogPanelHeader
        processName={process.name}
        processId={process.id}
        canStop={canStop}
        onRestart={handleRestart}
        onRequestStop={requestStop}
        onClose={onClose}
        search={search}
        onSearchChange={setSearch}
        activeGrep={activeGrep}
        searching={searching}
        hasEntries={entries.length > 0}
        afterContext={afterContext}
        onAfterContextChange={setAfterContext}
        selectedLevels={selectedLevels}
        onToggleLevel={toggleLevel}
        levelCounts={levelCounts}
        devices={devices}
        selectedDevices={selectedDevices}
        onToggleDevice={(name) => setSelectedDevices((current) => { const next = new Set(current); next.has(name) ? next.delete(name) : next.add(name); return next; })}
        deviceCounts={deviceCounts}
        showTime={showTime}
        onShowTimeChange={setShowTime}
        showLineNumbers={showLineNumbers}
        onShowLineNumbersChange={setShowLineNumbers}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        showJson={showJson}
        onShowJsonChange={setShowJson}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        colorizeBackground={colorizeBackground}
        onColorizeBackgroundChange={setColorizeBackground}
      />

      {command && <LogPanelCommandStrip command={command} />}

      <LogPanelBody
        closedNotice={closedNotice}
        error={error}
        entries={visibleEntries}
        grep={activeGrep}
        showTime={showTime}
        showLineNumbers={showLineNumbers}
        showJson={showJson}
        formatTime={formatTime}
        highlight={highlightRegex}
        fontTextClass={fontTextClass}
        fontLineClass={fontLineClass}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        backgroundMode={colorizeBackground ? (roomMode ? "client" : "level") : "none"}
      />

      {canStop && showStdin && (
        <LogPanelStdinBar
          processName={process.name}
          value={stdinValue}
          onValueChange={setStdinValue}
          onSubmit={handleSendInput}
          sending={sendingInput}
          onAppendSnippet={appendSnippet}
          onSendSignal={sendSignal}
        />
      )}

      <LogPanelFooter
        getCopyText={getCopyText}
        onClearLogs={handleClearLogs}
        canStop={canStop}
        showStdin={showStdin}
        onToggleStdin={() => setShowStdin((v) => !v)}
        grep={activeGrep}
        searching={searching}
        loading={loading}
        totalEntries={entries.length}
        visibleCount={visibleEntries.length}
        onCopyLocation={handleCopyLocation}
        onRevealLogFile={handleRevealLogFile}
        onDownloadLog={handleDownloadLog}
      />

      <LogPanelStopDialog
        open={pendingStop}
        onOpenChange={(open) => {
          if (!open) setPendingStop(false);
        }}
        onConfirm={confirmStop}
        processName={process.name}
        processId={process.id}
      />
    </aside>
  );
}
