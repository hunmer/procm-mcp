import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import {
  ArrowDownUpIcon,
  KanbanIcon,
  LayoutGridIcon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import { Group } from "@/registry/default/ui/group";
import { Input } from "@/registry/default/ui/input";
import {
  Select,
  SelectIcon,
  SelectItem,
  SelectItemText,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/registry/default/ui/select";
import {
  SORT_OPTIONS,
  STATUS_DOT,
  STATUS_OPTIONS,
  VIEW_OPTIONS,
  type SortMode,
  type StatusFilter,
  type ViewMode,
} from "./types";

// The filter bar above the merged list: view switch + status select (processes
// only) + sort select + name search + result count. Stateless — all
// values/setters come in as props so the orchestrator owns the state.
export function ProcessFilterBar({
  viewMode,
  onViewModeChange,
  statusFilter,
  onStatusFilterChange,
  sortMode,
  onSortModeChange,
  nameFilter,
  onNameFilterChange,
  shownCount,
  totalCount,
  right,
}: {
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  sortMode: SortMode;
  onSortModeChange: (v: SortMode) => void;
  nameFilter: string;
  onNameFilterChange: (v: string) => void;
  shownCount: number;
  totalCount: number;
  right?: ReactNode;
}) {
  const { t } = useTranslation();
  const current =
    STATUS_OPTIONS.find((o) => o.value === statusFilter) ??
    STATUS_OPTIONS[0];
  const currentSort =
    SORT_OPTIONS.find((o) => o.value === sortMode) ?? SORT_OPTIONS[0];
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
      <Group aria-label={t("processes.viewAria")}>
        {VIEW_OPTIONS.map((o) => (
          <Button
            key={o.value}
            size="icon-sm"
            variant={viewMode === o.value ? "secondary" : "ghost"}
            aria-pressed={viewMode === o.value}
            aria-label={t(o.labelKey)}
            title={t(o.labelKey)}
            onClick={() => onViewModeChange(o.value)}
          >
            {o.value === "grouped" ? (
              <LayoutGridIcon />
            ) : (
              <KanbanIcon />
            )}
          </Button>
        ))}
      </Group>
      <Select
        value={statusFilter}
        onValueChange={(v) => onStatusFilterChange((v as StatusFilter) ?? "all")}
      >
        <SelectTrigger size="sm" className="w-[180px]">
          <SelectValue>
            <span className="flex items-center gap-2">
              <span
                className={
                  "inline-block size-1.5 shrink-0 rounded-full " +
                  STATUS_DOT[statusFilter]
                }
              />
              {t(current.labelKey)}
            </span>
          </SelectValue>
          <SelectIcon />
        </SelectTrigger>
        <SelectPopup>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <SelectItemText>
                <span className="flex items-center gap-2">
                  <span
                    className={
                      "inline-block size-1.5 shrink-0 rounded-full " +
                      STATUS_DOT[o.value]
                    }
                  />
                  {t(o.labelKey)}
                </span>
              </SelectItemText>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <Select
        value={sortMode}
        onValueChange={(v) => onSortModeChange((v as SortMode) ?? "none")}
      >
        <SelectTrigger
          size="sm"
          className="w-[130px]"
          aria-label={t("processes.sortAria")}
          title={t("processes.sortAria")}
        >
          <SelectValue>
            <span className="flex items-center gap-2">
              <ArrowDownUpIcon className="size-3.5 shrink-0" />
              {t(currentSort.labelKey)}
            </span>
          </SelectValue>
          <SelectIcon />
        </SelectTrigger>
        <SelectPopup>
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <SelectItemText>{t(o.labelKey)}</SelectItemText>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      <div className="relative min-w-[180px] flex-1">
        <SearchIcon className="text-foreground/50 pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2" />
        <Input
          value={nameFilter}
          onChange={(e) => onNameFilterChange(e.target.value)}
          placeholder={t("processes.filterPlaceholder")}
          className="h-8 pl-8 text-xs"
        />
      </div>
      <span className="text-muted-foreground text-xs">
        {t("processes.countOfTotal", { shown: shownCount, total: totalCount })}
      </span>
      {right}
    </div>
  );
}
