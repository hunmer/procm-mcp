import { useTranslation } from "react-i18next";
import {
  CopyIcon,
  PanelRightCloseIcon,
  PlayIcon,
  RotateCwIcon,
  SearchIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/registry/default/ui/badge";
import { Button } from "@/registry/default/ui/button";
import { Checkbox } from "@/registry/default/ui/checkbox";
import { Input } from "@/registry/default/ui/input";
import { Slider } from "@/registry/default/ui/slider";
import { LEVEL_FILTERS } from "./constants";
import { LogPanelViewSettings } from "./LogPanelViewSettings";
import type { FontSize, LevelFilter } from "./types";

// The panel header: title + id row with run/restart/stop controls, the search
// box, the grep context-lines slider and the structured-level quick filter
// (with the view-settings popover pinned to its right). Stateless — all
// values/setters come in as props so LogPanel owns the state.
export function LogPanelHeader({
  processName,
  processId,
  canStop,
  onCopyId,
  onRestart,
  onRequestStop,
  onClose,
  search,
  onSearchChange,
  activeGrep,
  searching,
  hasEntries,
  afterContext,
  onAfterContextChange,
  selectedLevels,
  onToggleLevel,
  levelCounts,
  showTime,
  onShowTimeChange,
  showLineNumbers,
  onShowLineNumbersChange,
  autoScroll,
  onAutoScrollChange,
  showJson,
  onShowJsonChange,
  fontSize,
  onFontSizeChange,
}: {
  processName: string;
  processId: string;
  canStop: boolean;
  onCopyId: () => void;
  onRestart: () => void;
  onRequestStop: () => void;
  onClose: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  activeGrep: string;
  searching: boolean;
  hasEntries: boolean;
  afterContext: number;
  onAfterContextChange: (v: number) => void;
  selectedLevels: ReadonlySet<LevelFilter>;
  onToggleLevel: (v: LevelFilter) => void;
  levelCounts: Record<LevelFilter, number>;
  showTime: boolean;
  onShowTimeChange: (v: boolean) => void;
  showLineNumbers: boolean;
  onShowLineNumbersChange: (v: boolean) => void;
  autoScroll: boolean;
  onAutoScrollChange: (v: boolean) => void;
  showJson: boolean;
  onShowJsonChange: (v: boolean) => void;
  fontSize: FontSize;
  onFontSizeChange: (v: FontSize) => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="flex shrink-0 flex-col gap-3 border-b p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">
            {t("logs.panelTitle", { name: processName })}
          </h2>
          <div className="flex items-center gap-1.5">
            <p className="text-muted-foreground truncate font-mono text-xs">
              {processId}
            </p>
            <button
              type="button"
              aria-label={t("logs.copyIdAria")}
              title={t("logs.copyIdTitle")}
              onClick={onCopyId}
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
              aria-label={t("logs.runAria", { name: processName })}
              title={t("logs.runTitle")}
              onClick={onRestart}
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
            aria-label={t("logs.restartAria", { name: processName })}
            title={t("logs.restartTitle")}
            onClick={onRestart}
            className="text-muted-foreground hover:text-success"
          >
            <RotateCwIcon />
          </Button>
          {canStop && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("logs.stopAria", { name: processName })}
              title={t("logs.stopTitle")}
              onClick={onRequestStop}
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
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("logs.searchPlaceholder")}
          className="h-8 pl-8 pr-8 text-xs"
        />
        {search && (
          <button
            type="button"
            aria-label={t("logs.clearSearch")}
            onClick={() => onSearchChange("")}
            className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>

      {/* Context-lines slider: only relevant while viewing search results.
          Controls how many trailing lines are shown after each match; moving
          it re-runs the debounced grep with the new after-context count. */}
      {activeGrep && !searching && hasEntries && (
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-muted-foreground w-20 shrink-0 text-xs">
            {t("logs.contextAfter")}
          </span>
          <Slider
            value={afterContext}
            onValueChange={(v) =>
              onAfterContextChange(Array.isArray(v) ? v[0] : (v as number))
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

      {/* Structured-level quick filter: checkable badges, multiple levels may
          be combined. None checked shows every line, including legacy plain
          output without a level. The outer button carries the checkbox
          semantics; the inner Checkbox is a visual-only indicator so a click
          toggles exactly once. */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Log level">
        {LEVEL_FILTERS.map((f) => {
          const checked = selectedLevels.has(f.level);
          const count = levelCounts[f.level];
          return (
            <button
              key={f.level}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => onToggleLevel(f.level)}
              title={t("logs.filterByLevel", { level: f.label })}
            >
              <Badge
                variant={checked ? f.variant : "outline"}
                size="sm"
                className="cursor-pointer gap-1.5"
              >
                <Checkbox
                  checked={checked}
                  aria-hidden
                  tabIndex={-1}
                  className="pointer-events-none size-3"
                />
                {f.label}
                {count > 0 && (
                  <span className="font-normal opacity-60 tabular-nums">{count}</span>
                )}
              </Badge>
            </button>
          );
        })}
        <LogPanelViewSettings
          showTime={showTime}
          onShowTimeChange={onShowTimeChange}
          showLineNumbers={showLineNumbers}
          onShowLineNumbersChange={onShowLineNumbersChange}
          autoScroll={autoScroll}
          onAutoScrollChange={onAutoScrollChange}
          showJson={showJson}
          onShowJsonChange={onShowJsonChange}
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
        />
      </div>
    </header>
  );
}
