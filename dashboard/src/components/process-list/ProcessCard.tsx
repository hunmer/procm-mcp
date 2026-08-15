import { useTranslation } from "react-i18next";
import { PlayIcon, SquareIcon } from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import { Card, CardPanel } from "@/registry/default/ui/card";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/registry/default/ui/context-menu";
import { favoriteSignature } from "@/lib/favorites";
import type { ProcessView } from "@/lib/types";
import { canStopProcess } from "./utils";
import { ProcessCardBody } from "./ProcessCardBody";
import { ProcessActions } from "./ProcessActions";
import { ProcessContextMenu } from "./ProcessContextMenu";
import type { RowActions } from "./types";

// A live process card: header (name/status/command) + footer with the primary
// stop/run button and the shared action row. The whole card is a ContextMenu
// trigger and clicking it opens the log panel.
export function ProcessCard({
  p,
  isActive,
  unreadCount,
  favoritedSignatures,
  actions,
}: {
  p: ProcessView;
  isActive: boolean;
  unreadCount: number;
  favoritedSignatures: Set<string>;
  actions: RowActions;
}) {
  const { t } = useTranslation();
  const canStop = canStopProcess(p);
  const cmd = `${p.script}${p.args?.length ? " " + p.args.join(" ") : ""}`;
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Card
            className="cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--card),var(--color-black)_2%)] data-[state=selected]:bg-[color-mix(in_srgb,var(--card),var(--color-black)_4%)] dark:hover:bg-[color-mix(in_srgb,var(--card),var(--color-white)_2%)] dark:data-[state=selected]:bg-[color-mix(in_srgb,var(--card),var(--color-white)_4%)]"
            data-state={isActive ? "selected" : undefined}
            onClick={() => actions.onSelectLogs(p)}
          />
        }
      >
        <ProcessCardBody p={p} unreadCount={unreadCount} />
        <CardPanel className="flex flex-col gap-3 p-4">
          {/* Mirrors FavoriteCard: labeled command + working-directory blocks,
              then the actions row aligned to the bottom-right corner. */}
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
              {t("favorites.cardCommand")}
            </span>
            <code className="text-foreground/90 line-clamp-2 break-all bg-transparent text-xs">
              {cmd}
            </code>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
              {t("favorites.cardCwd")}
            </span>
            <span
              className="text-foreground/90 line-clamp-1 break-all font-mono text-xs"
              title={p.cwd}
            >
              {p.cwd}
            </span>
          </div>
          {/* Action icons on the left, the primary stop/run button on the
              right — mirroring FavoriteCard's bottom-right Launch button. */}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <ProcessActions
              process={p}
              favorited={favoritedSignatures.has(favoriteSignature(p))}
              onToggleFavorite={actions.onToggleFavorite}
              onRestart={actions.onRestart}
              onStop={actions.onRequestStop}
              onDelete={actions.onRequestDelete}
            />
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
          </div>
        </CardPanel>
      </ContextMenuTrigger>
      <ProcessContextMenu p={p} actions={actions} />
    </ContextMenu>
  );
}
