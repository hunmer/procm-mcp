import { useTranslation } from "react-i18next";
import { NetworkIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import { Input } from "@/registry/default/ui/input";
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

// A labeled search input with a leading icon. Used for the three filters; the
// icon slot keeps the bar compact while each field stays independently scoped.
function FilterInput({
  value,
  onChange,
  placeholder,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative min-w-[150px] flex-1">
      {icon}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 text-xs"
      />
    </div>
  );
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

      <FilterInput
        value={nameFilter}
        onChange={onNameFilterChange}
        placeholder={t("system.filterName")}
        icon={<SearchIcon className="text-foreground/50 pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2" />}
      />
      <FilterInput
        value={pathFilter}
        onChange={onPathFilterChange}
        placeholder={t("system.filterPath")}
        icon={<SearchIcon className="text-foreground/50 pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2" />}
      />
      <FilterInput
        value={cmdFilter}
        onChange={onCmdFilterChange}
        placeholder={t("system.filterCmd")}
        icon={<SearchIcon className="text-foreground/50 pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2" />}
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
