import { useTranslation } from "react-i18next";
import {
  CopyIcon,
  CopyPlusIcon,
  PencilIcon,
  PlayIcon,
  SquareIcon,
  SquareTerminalIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubPopup,
  ContextMenuSubTrigger,
} from "@/registry/default/ui/context-menu";
import type { ProcessView } from "@/lib/types";
import { canStopProcess } from "./utils";
import type { RowActions } from "./types";

// The right-click menu shared by the table rows and the cards. Extracted so the
// two views can't drift: Stop (when live) or Run (when stopped) first, then
// Edit and toggle favorite, then a Copy submenu (ID / command) above Delete.
// Rendered as a sibling of the ContextMenuTrigger.
export function ProcessContextMenu({
  p,
  actions,
}: {
  p: ProcessView;
  actions: RowActions;
}) {
  const { t } = useTranslation();
  const canStop = canStopProcess(p);
  return (
    <ContextMenuPopup>
      {canStop ? (
        <ContextMenuItem
          variant="destructive"
          onClick={() => actions.onRequestStop(p)}
        >
          <SquareIcon aria-hidden="true" />
          {t("processes.stopTitle")}
        </ContextMenuItem>
      ) : (
        <ContextMenuItem onClick={() => actions.onRestart(p.id)}>
          <PlayIcon aria-hidden="true" />
          {t("processes.runTitle")}
        </ContextMenuItem>
      )}
      <ContextMenuItem onClick={() => actions.onView(p)}>
        <PencilIcon aria-hidden="true" />
        {t("processes.ctxEdit")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.onClone(p)}>
        <CopyPlusIcon aria-hidden="true" />
        {t("processes.ctxClone")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.onToggleFavorite(p)}>
        <StarIcon aria-hidden="true" />
        {p.favorite
          ? t("processes.removeFavoriteTitle")
          : t("processes.addFavoriteTitle")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <CopyIcon aria-hidden="true" />
          {t("processes.ctxCopy")}
        </ContextMenuSubTrigger>
        <ContextMenuSubPopup>
          <ContextMenuItem onClick={() => actions.onCopyId(p)}>
            <CopyIcon aria-hidden="true" />
            {t("processes.ctxCopyId")}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => actions.onCopyCommand(p)}>
            <SquareTerminalIcon aria-hidden="true" />
            {t("processes.ctxCopyCommand")}
          </ContextMenuItem>
        </ContextMenuSubPopup>
      </ContextMenuSub>
      <ContextMenuItem
        variant="destructive"
        onClick={() => actions.onRequestDelete(p)}
      >
        <TrashIcon aria-hidden="true" />
        {t("processes.deleteTitle")}
      </ContextMenuItem>
    </ContextMenuPopup>
  );
}
