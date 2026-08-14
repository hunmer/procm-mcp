import { useTranslation } from "react-i18next";
import type { Table } from "@tanstack/react-table";
import { InboxIcon, PlayIcon, SquareIcon } from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import { Card, CardPanel } from "@/registry/default/ui/card";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/registry/default/ui/context-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import { favoriteSignature } from "@/lib/favorites";
import type { ProcessView } from "@/lib/types";
import { canStopProcess } from "./utils";
import { ProcessCardBody } from "./ProcessCardBody";
import { ProcessActions } from "./ProcessActions";
import { ProcessContextMenu } from "./ProcessContextMenu";
import type { RowActions } from "./types";

// The card-grid layout. `@container` makes the grid track the list's own width
// (not the viewport), so it collapses to one column when the log panel
// squeezes this side — each card keeps a usable minimum width instead of being
// crushed two-wide. Each card is a ContextMenu trigger.
export function ProcessCardsView({
  table,
  selectedId,
  now,
  unread,
  favoritedSignatures,
  processes,
  actions,
}: {
  table: Table<ProcessView>;
  selectedId: string | null;
  now: number;
  unread: Record<string, number>;
  favoritedSignatures: Set<string>;
  processes: ProcessView[];
  actions: RowActions;
}) {
  const { t } = useTranslation();
  return (
    <div className="@container min-h-0 flex-1 overflow-auto p-4">
      {table.getRowModel().rows.length ? (
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {table.getRowModel().rows.map((row) => {
            const p = row.original;
            const isActive = p.id === selectedId;
            const canStop = canStopProcess(p);
            return (
              <ContextMenu key={row.id}>
                <ContextMenuTrigger
                  render={
                    <Card
                      className="cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--card),var(--color-black)_2%)] data-[state=selected]:bg-[color-mix(in_srgb,var(--card),var(--color-black)_4%)] dark:hover:bg-[color-mix(in_srgb,var(--card),var(--color-white)_2%)] dark:data-[state=selected]:bg-[color-mix(in_srgb,var(--card),var(--color-white)_4%)]"
                      data-state={isActive ? "selected" : undefined}
                      onClick={() => actions.onSelectLogs(p)}
                    />
                  }
                >
                  <ProcessCardBody p={p} now={now} unreadCount={unread[p.id] ?? 0} />
                  <CardPanel className="flex flex-col gap-3 p-4">
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                      {canStop ? (
                        <Button size="sm" onClick={() => actions.onRequestStop(p)}>
                          <SquareIcon />
                          {t("processes.stopTitle")}
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => actions.onRestart(p.id)}>
                          <PlayIcon />
                          {t("processes.runTitle")}
                        </Button>
                      )}
                      <ProcessActions
                        process={p}
                        favorited={favoritedSignatures.has(favoriteSignature(p))}
                        onToggleFavorite={actions.onToggleFavorite}
                        onRestart={actions.onRestart}
                        onStop={actions.onRequestStop}
                        onDelete={actions.onRequestDelete}
                      />
                    </div>
                  </CardPanel>
                </ContextMenuTrigger>
                <ProcessContextMenu p={p} actions={actions} />
              </ContextMenu>
            );
          })}
        </div>
      ) : (
        <Empty className="mx-auto max-w-sm py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>
              {processes.length === 0
                ? t("processes.emptyNoProcesses")
                : t("processes.emptyNoMatches")}
            </EmptyTitle>
            <EmptyDescription>
              {processes.length === 0
                ? t("processes.emptyDescNoProcesses")
                : t("processes.emptyDescNoMatches")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
