import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  CopyIcon,
  FolderOpenIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Badge } from "@/registry/default/ui/badge";
import { Button } from "@/registry/default/ui/button";
import { ScrollArea } from "@/registry/default/ui/scroll-area";
import { Skeleton } from "@/registry/default/ui/skeleton";
import { Spinner } from "@/registry/default/ui/spinner";
import { cn } from "@/registry/default/lib/utils";
import {
  listLogFiles,
  parseLogText,
  readLogFileContent,
  revealPath,
} from "@/lib/api";
import type { LogEntry, LogFileSummary } from "@/lib/types";
import { stripAnsi } from "./TerminalLog";
import { LogPanelBody } from "./log-panel/LogPanelBody";
import { useLogPanelViewState } from "./log-panel/useLogPanelViewState";
import { LogPanelHeader } from "./log-panel/LogPanelHeader";
import type { LevelFilter } from "./log-panel/types";

// Human-readable byte size: "832 B" / "12.4 KB" / "1.8 MB".
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// HH:MM:SS time for log lines (same format LogPanel uses).
function formatTime(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

// One row in the left-hand file list: process name (or id), a stdout/stderr
// badge, and the file's size + last-modified time. When the owning process is
// live and running (its record status says so), a green badge marks the file
// as still being written to.
function LogFileRow({
  file,
  active,
  onSelect,
}: {
  file: LogFileSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const running = file.status === "running" || file.status === "spawning";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "hover:bg-accent flex w-full flex-col items-start gap-1 border-b px-3 py-2 text-left last:border-b-0",
        active && "bg-accent",
      )}
    >
      <span className="flex w-full items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
          {file.processName ?? file.processId}
        </span>
        {running && (
          <Badge variant="success" className="gap-1 px-1 text-[10px]">
            <span className="inline-block size-1.5 rounded-full bg-current" />
            {t("status.running")}
          </Badge>
        )}
        <Badge
          variant={file.stream === "stderr" ? "warning" : "secondary"}
          className="shrink-0 px-1 text-[10px]"
        >
          {file.stream}
        </Badge>
      </span>
      <span className="text-muted-foreground flex w-full items-center gap-2 text-[11px] tabular-nums">
        <span>{formatSize(file.size)}</span>
        <span className="truncate" title={new Date(file.modifiedAt).toLocaleString()}>
          {new Date(file.modifiedAt).toLocaleString()}
        </span>
      </span>
      <span className="text-muted-foreground/70 truncate font-mono text-[10px]">
        {file.name}
      </span>
    </button>
  );
}

// First-load placeholder mirroring LogFileRow's three lines (name+badges,
// size/time, filename). Only shown when there's no stale list to keep
// visible; refreshes don't flash the skeleton over existing rows.
// p-skeleton-1: https://coss.com/ui/r/p-skeleton-1.json
function LogFileRowSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="flex w-full flex-col items-start gap-1 border-b px-3 py-2 last:border-b-0"
        >
          <span className="flex w-full items-center gap-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-4 w-12" />
          </span>
          <span className="flex w-full items-center gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-28" />
          </span>
          <Skeleton className="h-2.5 w-2/3" />
        </div>
      ))}
    </>
  );
}

// Browser for the on-disk process log files (`<id>-<stream>.log` under the
// server's processes dir): the file list on the left, the selected file's
// content in a terminal view on the right. Used by the history-log tab (all
// files) and the per-process dialog (filtered by processId).
export function LogFilesView({
  processId,
  className,
  reloadKey = 0,
}: {
  // Restrict the list to one process's files; null/undefined shows everything.
  processId?: string | null;
  className?: string;
  // Bump to re-run loadList while mounted (e.g. after the parent cleared
  // log files through the bulk-delete API).
  reloadKey?: number;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<LogFileSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  // Whether the loaded content was tail-cut by the backend's 10MB cap.
  const [truncated, setTruncated] = useState(false);
  const view = useLogPanelViewState(entries);
  const { search, setSearch, visibleEntries, showJson, setShowJson, selectedLevels, setSelectedLevels, selectedDevices, setSelectedDevices, devices, levelCounts, deviceCounts, showTime, setShowTime, showLineNumbers, setShowLineNumbers, autoScroll, setAutoScroll, fontSize, setFontSize, colorizeBackground, setColorizeBackground } = view;

  const loadList = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const all = await listLogFiles();
      const mine = processId
        ? all.filter((f) => f.processId === processId)
        : all;
      setFiles(mine);
      setSelectedPath((cur) =>
        cur && mine.some((f) => f.path === cur) ? cur : (mine[0]?.path ?? null),
      );
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
      setFiles([]);
      setSelectedPath(null);
    } finally {
      setLoading(false);
    }
  }, [processId]);

  useEffect(() => {
    void loadList();
  }, [loadList, reloadKey]);

  // Load the selected file's content whenever the selection (or a refresh)
  // changes it. Cancelled flips on cleanup so a stale response can't land.
  useEffect(() => {
    setSearch("");
    if (!selectedPath) {
      setEntries([]);
      setContentError(null);
      setTruncated(false);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    setContentError(null);
    const stream = selectedPath.endsWith("stderr.log") ? "stderr" : "stdout";
    readLogFileContent(selectedPath)
      .then((r) => {
        if (!cancelled) {
          setEntries(parseLogText(r.text, stream));
          setTruncated(r.truncated);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEntries([]);
          setTruncated(false);
          setContentError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const selected = files.find((f) => f.path === selectedPath) ?? null;

  // Reveal the selected file in the OS file manager (the backend shells out;
  // failures are logged server-side, nothing user-actionable here).
  async function handleReveal() {
    if (!selectedPath) return;
    await revealPath(selectedPath).catch(() => {});
  }

  // Copy the currently displayed entries (what this component loaded, possibly
  // tail-truncated — not the whole file) in the same format as LogPanel's copy:
  // timestamp + optional stderr tag, ANSI stripped.
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    if (entries.length === 0) return;
    const text = entries
      .map((e) => {
        const time = `[${formatTime(e.timestamp)}]`;
        const tag = e.stream === "stderr" ? ` [${e.stream}]` : "";
        return `${time}${tag} ${stripAnsi(e.message)}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context); nothing actionable.
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-1 overflow-hidden", className)}>
      {/* Left: log file list. */}
      <div className="bg-card flex w-72 shrink-0 flex-col border-r">
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">
            {t("logFiles.listTitle")}
            {files.length > 0 && (
              <span className="text-muted-foreground ml-1.5 text-xs">
                ({files.length})
              </span>
            )}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("logFiles.refreshAria")}
            title={t("logFiles.refreshTitle")}
            onClick={() => void loadList()}
          >
            <RefreshCwIcon className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {listError ? (
            <p className="text-destructive px-3 py-2 text-xs">
              {t("logFiles.listError", { message: listError })}
            </p>
          ) : loading && files.length === 0 ? (
            <LogFileRowSkeleton />
          ) : !loading && files.length === 0 ? (
            <div className="text-muted-foreground p-3 text-xs">
              {processId
                ? t("logFiles.emptyForProcess")
                : t("logFiles.empty")}
            </div>
          ) : (
            files.map((f) => (
              <LogFileRow
                key={f.path}
                file={f}
                active={f.path === selectedPath}
                onSelect={() => setSelectedPath(f.path)}
              />
            ))
          )}
        </ScrollArea>
      </div>

      {/* Right: the selected file's content on a terminal surface. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <LogPanelHeader
          processName={selected?.processName ?? t("logFiles.noneSelected")}
          processId={selected?.processId ?? ""}
          canStop={false}
          onRestart={() => undefined}
          onRequestStop={() => undefined}
          onClose={() => undefined}
          search={search}
          onSearchChange={setSearch}
          activeGrep=""
          searching={false}
          hasEntries={entries.length > 0}
          afterContext={0}
          onAfterContextChange={() => undefined}
          selectedLevels={selectedLevels}
          onToggleLevel={(level: LevelFilter) => setSelectedLevels((current) => { const next = new Set(current); next.has(level) ? next.delete(level) : next.add(level); return next; })}
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
          hideProcessControls
        />
        <div className="bg-card flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <ScrollTextIcon className="text-muted-foreground size-3.5 shrink-0" />
          <span className="truncate font-mono text-xs" title={selected?.path}>
            {selected?.name ?? t("logFiles.noneSelected")}
          </span>
          {selected && (
            <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
              {formatSize(selected.size)} ·{" "}
              {t("logFiles.lineCount", { count: entries.length })}
            </span>
          )}
          {selected && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("logFiles.copyAria")}
              title={t("logFiles.copyTitle")}
              onClick={() => void handleCopy()}
              className="text-muted-foreground shrink-0"
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          )}
          {selected && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("logFiles.revealAria")}
              title={t("logFiles.revealTitle")}
              onClick={() => void handleReveal()}
              className="text-muted-foreground ml-auto shrink-0"
            >
              <FolderOpenIcon />
            </Button>
          )}
        </div>
        <LogPanelBody
          closedNotice={false}
          error={contentError}
          errorText={contentError ? t("logFiles.contentError", { message: contentError }) : undefined}
          entries={visibleEntries}
          grep=""
          showTime={showTime}
          showLineNumbers={showLineNumbers}
          showJson={showJson}
          formatTime={formatTime}
          highlight={null}
          fontTextClass={fontSize === "xs" ? "text-xs" : fontSize === "sm" ? "text-sm" : "text-base"}
          fontLineClass={fontSize === "xs" ? "leading-relaxed" : "leading-normal"}
          backgroundMode={colorizeBackground ? "level" : "none"}
          loading={contentLoading}
          loadingText={<Spinner className="text-zinc-500 size-5" />}
          emptyTitle={t("logFiles.contentEmpty")}
          emptyDescription={t("logFiles.contentEmptyDesc")}
          notice={truncated ? (
            <div className="mb-2 flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              {t("logFiles.truncated")}
            </div>
          ) : undefined}
        />
      </div>
    </div>
  );
}
