import { useTranslation } from "react-i18next";
import {
  ActivityIcon,
  DoorOpenIcon,
  FlaskConicalIcon,
  HistoryIcon,
  ListIcon,
  TrashIcon,
} from "lucide-react";
import { Badge } from "@/registry/default/ui/badge";
import { Button } from "@/registry/default/ui/button";
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsTab,
} from "@/registry/default/ui/tabs";
import type { ProcessListResponse } from "@/lib/types";
import { TAB_ROUTES, type DashboardTab } from "./dashboardRoutes";

interface DashboardHeaderProps {
  activeTab: DashboardTab;
  data: ProcessListResponse | null;
  processCount: number;
  roomCount: number;
  runningCount: number;
  onTabChange: (tab: DashboardTab) => void;
  onClearAll: () => void;
  onClearLogs: () => void;
}

export function DashboardHeader({
  activeTab,
  data,
  processCount,
  roomCount,
  runningCount,
  onTabChange,
  onClearAll,
  onClearLogs,
}: DashboardHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 overflow-x-auto border-b px-4 py-2.5">
      <Tabs
        className="shrink-0"
        value={activeTab}
        onValueChange={(value) => {
          const tab = value in TAB_ROUTES ? (value as DashboardTab) : "processes";
          if (tab !== activeTab) onTabChange(tab);
        }}
      >
        <TabsList className="relative">
          <TabsTab value="processes">
            <ListIcon className="size-3.5" />
            {t("header.tabProcesses")}
            {processCount > 0 && (
              <span className="text-muted-foreground text-xs">({processCount})</span>
            )}
          </TabsTab>
          <TabsTab value="history">
            <HistoryIcon className="size-3.5" />
            {t("header.tabHistory")}
          </TabsTab>
          <TabsTab value="rooms">
            <DoorOpenIcon className="size-3.5" />
            {t("header.tabRooms")}
            {roomCount > 0 && (
              <span className="text-muted-foreground text-xs">({roomCount})</span>
            )}
          </TabsTab>
          <TabsTab value="system">
            <ActivityIcon className="size-3.5" />
            {t("header.tabSystem")}
          </TabsTab>
          <TabsTab value="playground">
            <FlaskConicalIcon className="size-3.5" />
            {t("header.tabPlayground")}
          </TabsTab>
          <TabsIndicator />
        </TabsList>
      </Tabs>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {data && (
          <Badge
            variant="outline"
            className="font-mono text-xs"
            title={`backend ${
              data.port ? `127.0.0.1:${data.port}` : window.location.host
            } · serverId ${data.serverId} · pid ${data.pid}`}
          >
            {data.port ? `127.0.0.1:${data.port}` : window.location.host}{" "}
            · {data.serverId}({data.pid})
          </Badge>
        )}
        {activeTab === "processes" && runningCount > 0 && (
          <Badge variant="success" className="gap-1.5">
            <span className="inline-block size-1.5 rounded-full bg-current" />
            {t("header.running", { count: runningCount })}
          </Badge>
        )}
        {activeTab === "processes" && processCount > 0 && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("header.clearAllTitle")}
            title={t("header.clearAllTitle")}
            onClick={onClearAll}
          >
            <TrashIcon />
          </Button>
        )}
        {activeTab === "history" && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("header.clearLogsTitle")}
            title={t("header.clearLogsTitle")}
            onClick={onClearLogs}
          >
            <TrashIcon />
          </Button>
        )}
      </div>
    </div>
  );
}
