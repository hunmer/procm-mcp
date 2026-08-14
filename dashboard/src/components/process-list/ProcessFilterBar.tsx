import { useTranslation } from "react-i18next";
import { LayoutGridIcon, LayoutListIcon, SearchIcon } from "lucide-react";
import { Button } from "@/registry/default/ui/button";
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
  STATUS_DOT,
  STATUS_OPTIONS,
  type StatusFilter,
  type ViewMode,
} from "./types";

// The filter bar above the list: status select + name search + result count,
// plus the table/cards layout toggle. Stateless — all values/setters come in
// as props so the orchestrator owns the state.
export function ProcessFilterBar({
  statusFilter,
  onStatusFilterChange,
  nameFilter,
  onNameFilterChange,
  viewMode,
  onViewModeChange,
  shownCount,
  totalCount,
}: {
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  nameFilter: string;
  onNameFilterChange: (v: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  shownCount: number;
  totalCount: number;
}) {
  const { t } = useTranslation();
  const current =
    STATUS_OPTIONS.find((o) => o.value === statusFilter) ??
    STATUS_OPTIONS[0];
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
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
      {/* Layout toggle: table rows vs card grid. */}
      <div className="ml-auto flex items-center gap-0.5">
        <Button
          size="icon-sm"
          variant={viewMode === "table" ? "secondary" : "ghost"}
          aria-label={t("processes.viewTableAria")}
          title={t("processes.viewTableTitle")}
          aria-pressed={viewMode === "table"}
          onClick={() => onViewModeChange("table")}
        >
          <LayoutListIcon />
        </Button>
        <Button
          size="icon-sm"
          variant={viewMode === "cards" ? "secondary" : "ghost"}
          aria-label={t("processes.viewCardsAria")}
          title={t("processes.viewCardsTitle")}
          aria-pressed={viewMode === "cards"}
          onClick={() => onViewModeChange("cards")}
        >
          <LayoutGridIcon />
        </Button>
      </div>
    </div>
  );
}
