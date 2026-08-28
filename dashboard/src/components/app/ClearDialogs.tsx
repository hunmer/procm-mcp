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

interface ClearDialogsProps {
  clearAllOpen: boolean;
  clearLogsOpen: boolean;
  processCount: number;
  onClearAllOpenChange: (open: boolean) => void;
  onClearLogsOpenChange: (open: boolean) => void;
  onClearAll: () => void;
  onClearLogs: () => void;
}

export function ClearDialogs({
  clearAllOpen,
  clearLogsOpen,
  processCount,
  onClearAllOpenChange,
  onClearLogsOpenChange,
  onClearAll,
  onClearLogs,
}: ClearDialogsProps) {
  const { t } = useTranslation();

  return (
    <>
      <AlertDialog open={clearAllOpen} onOpenChange={onClearAllOpenChange}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("header.clearAllQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("header.clearAllDescription", { count: processCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <AlertDialogClose render={<Button variant="destructive" />} onClick={onClearAll}>
              {t("header.clearAll")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      <AlertDialog open={clearLogsOpen} onOpenChange={onClearLogsOpenChange}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("header.clearLogsQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>{t("header.clearLogsDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("common.cancel")}
            </AlertDialogClose>
            <AlertDialogClose render={<Button variant="destructive" />} onClick={onClearLogs}>
              {t("header.clearLogs")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
