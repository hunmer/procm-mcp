import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/registry/default/ui/alert-dialog";
import { Button } from "@/registry/default/ui/button";
import type { ProcessView } from "@/lib/types";
import { canStopProcess } from "./utils";

// The delete and stop confirmation dialogs. Both are driven by the
// pending* state from useProcessActions; closing either clears its pending
// process. Deleting a running process warns that it's stopped first.
export function ProcessDialogs({
  pendingDelete,
  pendingStop,
  onConfirmDelete,
  onConfirmStop,
  onDismissDelete,
  onDismissStop,
}: {
  pendingDelete: ProcessView | null;
  pendingStop: ProcessView | null;
  onConfirmDelete: () => void;
  onConfirmStop: () => void;
  onDismissDelete: () => void;
  onDismissStop: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {/* Delete confirmation. Triggered from the row action button or the
          context menu (both call requestDelete). */}
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) onDismissDelete();
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("processes.deleteQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete &&
                (() => {
                  const running = canStopProcess(pendingDelete);
                  return running
                    ? t("processes.deleteDescriptionRunning", {
                        name: pendingDelete.name,
                        id: pendingDelete.id,
                      })
                    : t("processes.deleteDescriptionStopped", {
                        name: pendingDelete.name,
                        id: pendingDelete.id,
                      });
                })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={onConfirmDelete}
            >
              {t("common.delete")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Stop confirmation. Triggered from the row action button or the
          context menu (both call requestStop). Stopping keeps the record. */}
      <AlertDialog
        open={pendingStop != null}
        onOpenChange={(open) => {
          if (!open) onDismissStop();
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("processes.stopQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStop &&
                t("processes.stopDescription", {
                  name: pendingStop.name,
                  id: pendingStop.id,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={onConfirmStop}
            >
              {t("common.stop")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
