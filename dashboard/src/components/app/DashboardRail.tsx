import { useTranslation } from "react-i18next";
import {
  ActivityIcon,
  DoorOpenIcon,
  FlaskConicalIcon,
  HistoryIcon,
  ListIcon,
  type LucideIcon,
} from "lucide-react";
import { SettingsDialog } from "../SettingsDialog";
import { Button } from "@/registry/default/ui/button";
import type { ProcessView } from "@/lib/types";
import type { DashboardTab } from "./dashboardRoutes";

const RAIL_TABS: { value: DashboardTab; labelKey: string; icon: LucideIcon }[] = [
  { value: "processes", labelKey: "header.tabProcesses", icon: ListIcon },
  { value: "history", labelKey: "header.tabHistory", icon: HistoryIcon },
  { value: "rooms", labelKey: "header.tabRooms", icon: DoorOpenIcon },
  { value: "system", labelKey: "header.tabSystem", icon: ActivityIcon },
  { value: "playground", labelKey: "header.tabPlayground", icon: FlaskConicalIcon },
];

interface DashboardRailProps {
  status: string;
  statusMeta: string;
  uptime: string | null;
  processes: ProcessView[];
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onToast: (message: string, isError?: boolean) => void;
}

export function DashboardRail({
  status,
  statusMeta,
  uptime,
  processes,
  activeTab,
  onTabChange,
  onToast,
}: DashboardRailProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-card flex w-[60px] shrink-0 flex-col items-center rounded-xl border py-3 shadow-sm">
      <span
        className={
          "mt-1 inline-block size-2.5 shrink-0 rounded-full " +
          (status === "open"
            ? "bg-green-500"
            : status === "connecting"
              ? "bg-yellow-500"
              : "bg-red-500")
        }
        title={`${statusMeta}${uptime ? ` · ${uptime}` : ""}`}
        aria-label={statusMeta}
      />
      <nav className="mt-4 flex flex-col items-center gap-1.5" aria-label={t("app.title")}>
        {RAIL_TABS.map(({ value, labelKey, icon: Icon }) => {
          const active = value === activeTab;
          return (
            <Button
              key={value}
              size="icon-sm"
              variant={active ? "default" : "ghost"}
              title={t(labelKey)}
              aria-label={t(labelKey)}
              aria-current={active ? "page" : undefined}
              onClick={() => onTabChange(value)}
            >
              <Icon className="size-4" />
            </Button>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-2">
        <SettingsDialog processes={processes} onToast={onToast} />
      </div>
    </div>
  );
}
