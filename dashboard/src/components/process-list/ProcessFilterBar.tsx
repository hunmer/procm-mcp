import { useTranslation } from "react-i18next";
import { DownloadIcon, SearchIcon } from "lucide-react";
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
} from "./types";

// The filter bar above the merged list: status select (processes only) + name
// search (processes and favorites) + result count, plus the folder-import
// button for favorites. Stateless — all values/setters come in as props so the
// orchestrator owns the state.
export function ProcessFilterBar({
  statusFilter,
  onStatusFilterChange,
  nameFilter,
  onNameFilterChange,
  shownCount,
  totalCount,
  onImport,
}: {
  statusFilter: StatusFilter;
  onStatusFilterChange: (v: StatusFilter) => void;
  nameFilter: string;
  onNameFilterChange: (v: string) => void;
  shownCount: number;
  totalCount: number;
  onImport: () => void;
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
      <div className="ml-auto flex items-center gap-0.5">
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={t("favorites.importAria")}
          title={t("favorites.importTitle")}
          onClick={onImport}
        >
          <DownloadIcon />
        </Button>
      </div>
    </div>
  );
}
