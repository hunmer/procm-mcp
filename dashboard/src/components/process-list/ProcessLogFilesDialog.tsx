import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/registry/default/ui/dialog";
import type { ProcessView } from "@/lib/types";
import { LogFilesView } from "../LogFilesView";

// Dialog listing one process's on-disk log files (`<id>-<stream>.log`) with
// the selected file's content rendered by the shared TerminalLog view. Opened
// from the per-row "view log files" dropdown in ProcessActions. The list is
// fetched on open (Base UI unmounts the closed popup, so every open re-loads).
export function ProcessLogFilesDialog({
  process,
  open,
  onOpenChange,
}: {
  process: ProcessView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:w-[85vw] sm:max-w-[85vw]">
        <DialogHeader>
          <DialogTitle>{t("logFiles.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {process
              ? t("logFiles.dialogDescription", {
                  name: process.name,
                  id: process.id,
                })
              : ""}
          </DialogDescription>
        </DialogHeader>
        {/* key by process id so switching rows resets the file selection. */}
        <LogFilesView
          key={process?.id ?? null}
          processId={process?.id ?? null}
          className="h-[80vh] rounded-lg border"
        />
      </DialogPopup>
    </Dialog>
  );
}
