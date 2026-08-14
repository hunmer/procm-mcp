import { useTranslation } from "react-i18next";
import {
  CopyIcon,
  EyeIcon,
  PlayIcon,
  SquareIcon,
  SquareTerminalIcon,
} from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
} from "@/registry/default/ui/context-menu";
import type { ProcessView } from "@/lib/types";
import { canStopProcess } from "./utils";
import type { RowActions } from "./types";

// The right-click menu shared by the table rows and the cards. Extracted so the
// two views can't drift: Copy ID / Copy command / View, then Stop (when live)
// or Restart (when stopped). Rendered as a sibling of the ContextMenuTrigger.
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
      <ContextMenuItem onClick={() => actions.onCopyId(p)}>
        <CopyIcon aria-hidden="true" />
        {t("processes.ctxCopyId")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.onCopyCommand(p)}>
        <SquareTerminalIcon aria-hidden="true" />
        {t("processes.ctxCopyCommand")}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => actions.onView(p)}>
        <EyeIcon aria-hidden="true" />
        {t("processes.ctxView")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      {canStop ? (
        <ContextMenuItem
          variant="destructive"
          onClick={() => actions.onRequestStop(p)}
        >
          <SquareIcon aria-hidden="true" />
          {t("processes.ctxStop")}
        </ContextMenuItem>
      ) : (
        <ContextMenuItem onClick={() => actions.onRestart(p.id)}>
          <PlayIcon aria-hidden="true" />
          {t("processes.ctxRestart")}
        </ContextMenuItem>
      )}
    </ContextMenuPopup>
  );
}
