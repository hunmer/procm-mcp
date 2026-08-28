import { useTranslation } from "react-i18next";
import { EyeIcon, FolderOpenIcon, SkullIcon } from "lucide-react";
import {
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
} from "@/registry/default/ui/context-menu";
import type { ProcessRow, RowActions } from "./types";
import { exePathOfRow } from "./utils";

// The right-click menu shared by the system-process rows: View info (opens the
// read-only dialog), Open process location (reveals the exe), and Kill. The
// location item is disabled when no path is resolvable; Kill is disabled for
// protected kernel pids (the backend refuses them anyway).
export function SystemProcessContextMenu({
  row,
  actions,
}: {
  row: ProcessRow;
  actions: RowActions;
}) {
  const { t } = useTranslation();
  const hasLocation = exePathOfRow(row) != null;
  const protectedPid = row.members.some((m) => m.pid <= 4);
  return (
    <ContextMenuPopup>
      <ContextMenuItem onClick={() => actions.onView(row)}>
        <EyeIcon aria-hidden="true" />
        {t("system.ctxView")}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!hasLocation}
        onClick={() => actions.onReveal(row)}
      >
        <FolderOpenIcon aria-hidden="true" />
        {t("system.ctxOpenLocation")}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        disabled={protectedPid}
        onClick={() => actions.onKill(row)}
      >
        <SkullIcon aria-hidden="true" />
        {t("system.ctxKill")}
      </ContextMenuItem>
    </ContextMenuPopup>
  );
}
