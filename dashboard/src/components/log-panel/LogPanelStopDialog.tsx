import { useTranslation } from "react-i18next";
import { Button } from "@/registry/default/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/registry/default/ui/alert-dialog";

// Stop confirmation: triggered from the header Stop button. Stopping keeps
// the record (and its on-disk logs) as history. Stateless — open state and
// the confirm handler are owned by LogPanel.
export function LogPanelStopDialog({
  open,
  onOpenChange,
  onConfirm,
  processName,
  processId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  processName: string;
  processId: string;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("logs.stopQuestion")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("logs.stopDescription", { name: processName, id: processId })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>
            {t("common.cancel")}
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button variant="destructive" />}
            onClick={onConfirm}
          >
            {t("common.stop")}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
