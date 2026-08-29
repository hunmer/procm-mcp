import { useTranslation } from "react-i18next";
import { NetworkIcon, RefreshCwIcon } from "lucide-react";
import { FilterSearchGroup } from "@/components/FilterGroup";
import { Button } from "@/registry/default/ui/button";
import { Switch } from "@/registry/default/ui/switch";
import {
  Select,
  SelectItem,
  SelectItemText,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/registry/default/ui/select";
import { INTERVAL_OPTIONS } from "./types";

// Refresh-interval select labels: render "Ns" for each option.
function intervalLabel(ms: number): string {
  return `${ms / 1000}s`;
}

// Filter + refresh bar. Three independent substring filters, a manual refresh
// button, and the live-refresh toggle with its interval.
export function SystemProcessFilterBar({
  shown,
  total,
  nameFilter,
  onNameFilterChange,
  pathFilter,
  onPathFilterChange,
  cmdFilter,
  onCmdFilterChange,
  portsOnly,
  onPortsOnlyChange,
  liveRefresh,
  onLiveRefreshChange,
  intervalMs,
  onIntervalMsChange,
  refreshing,
  onRefresh,
  onOpenPortLookup,
}: {
  shown: number;
  total: number;
  nameFilter: string;
  onNameFilterChange: (v: string) => void;
  pathFilter: string;
  onPathFilterChange: (v: string) => void;
  cmdFilter: string;
  onCmdFilterChange: (v: string) => void;
  portsOnly: boolean;
  onPortsOnlyChange: (v: boolean) => void;
  liveRefresh: boolean;
  onLiveRefreshChange: (v: boolean) => void;
  intervalMs: number;
  onIntervalMsChange: (v: number) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenPortLookup: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
      <span className="text-muted-foreground whitespace-nowrap text-xs">
        {t("system.countOfTotal", { shown, total })}
      </span>

      {/* Three substring filters, each a labeled p-group-23-style search
          group (search-icon label | input | clear) so the bar matches the
          log-panel filter groups. */}
      <FilterSearchGroup
        value={nameFilter}
        onChange={onNameFilterChange}
        onClear={() => onNameFilterChange("")}
        label={t("system.filterNameLabel")}
        placeholder={t("system.filterName")}
      />
      <FilterSearchGroup
        value={pathFilter}
        onChange={onPathFilterChange}
        onClear={() => onPathFilterChange("")}
        label={t("system.filterPathLabel")}
        placeholder={t("system.filterPath")}
      />
      <FilterSearchGroup
        value={cmdFilter}
        onChange={onCmdFilterChange}
        onClear={() => onCmdFilterChange("")}
        label={t("system.filterCmdLabel")}
        placeholder={t("system.filterCmd")}
      />

      {/* Ports-only view: keeps just the processes listening on a TCP port
          (dev servers etc.). Composes with the text filters above. */}
      <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs">
        <Switch
          checked={portsOnly}
          onCheckedChange={onPortsOnlyChange}
          aria-label={t("system.portsOnly")}
        />
        {t("system.portsOnly")}
      </label>

      <div className="ml-auto flex items-center gap-3">
        {/* Live refresh toggle + interval. The interval select is only
            relevant while polling, so it only renders when the switch is on. */}
        <div className="flex items-center gap-2">
          <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
            <Switch
              checked={liveRefresh}
              onCheckedChange={onLiveRefreshChange}
              aria-label={t("system.liveRefresh")}
            />
            {t("system.liveRefresh")}
          </label>
          {liveRefresh && (
            <Select
              value={String(intervalMs)}
              onValueChange={(v) =>
                onIntervalMsChange(Number(v) || 2000)
              }
            >
              <SelectTrigger size="sm" className="h-8 w-[68px]">
                <SelectValue>{intervalLabel(intervalMs)}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {INTERVAL_OPTIONS.map((ms) => (
                  <SelectItem key={ms} value={String(ms)}>
                    <SelectItemText>{intervalLabel(ms)}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          )}
        </div>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={t("system.portLookupTitle")}
          title={t("system.portLookupTitle")}
          onClick={onOpenPortLookup}
        >
          <NetworkIcon className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={t("system.refreshNow")}
          title={t("system.refreshNow")}
          onClick={onRefresh}
        >
          <RefreshCwIcon className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
        </Button>
      </div>
    </div>
  );
}
