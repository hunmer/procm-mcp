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
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/registry/default/ui/dialog";
import { Button } from "@/registry/default/ui/button";
import { Input } from "@/registry/default/ui/input";
import type { ProcessRow } from "./types";
import { SystemProcessInfo } from "./SystemProcessInfo";

// Kill confirmation. Killing a tree is irreversible and takes down children
// too, so confirm with the pid + name up front. Driven by the pendingKill
// state from the parent; closing clears it.
export function KillConfirmDialog({
  pendingKill,
  onDismiss,
  onConfirm,
}: {
  pendingKill: ProcessRow | null;
  onDismiss: () => void;
  onConfirm: (row: ProcessRow) => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog
      open={pendingKill != null}
      onOpenChange={(o) => !o && onDismiss()}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("system.killConfirmTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingKill &&
              (pendingKill.members.length > 1
                ? t("system.killConfirmGroupDescription", {
                    name: pendingKill.name,
                    count: pendingKill.members.length,
                  })
                : t("system.killConfirmDescription", {
                    name: pendingKill.name,
                    pid: pendingKill.pid,
                  }))}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>
            {t("common.cancel")}
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button variant="destructive" />}
            onClick={() => pendingKill && onConfirm(pendingKill)}
          >
            {t("system.kill")}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

// Read-only process info dialog (the "View info" action). Shows the process's
// identity + full executable path + command line, each long field with a copy
// button. Driven by the viewing state from the parent; closing clears it.
export function ProcessInfoDialog({
  viewing,
  onDismiss,
  onCopy,
}: {
  viewing: ProcessRow | null;
  onDismiss: () => void;
  onCopy: (value: string, label: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={viewing != null} onOpenChange={(o) => !o && onDismiss()}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("system.infoTitle")}</DialogTitle>
          <DialogDescription>
            {viewing
              ? viewing.members.length > 1
                ? t("system.infoGroupDescription", {
                    name: viewing.name,
                    count: viewing.members.length,
                  })
                : t("system.infoDescription", {
                    name: viewing.name,
                    pid: viewing.pid,
                  })
              : ""}
          </DialogDescription>
        </DialogHeader>
        {viewing && (
          <SystemProcessInfo row={viewing} onCopy={onCopy} />
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>
            {t("common.close")}
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

// Toolbar "view port" lookup: enter a port, the backend runs find-process,
// and the owning process opens in the info dialog. Quick-pick chips list
// ports already seen in the current snapshot.
export function PortLookupDialog({
  open,
  onOpenChange,
  portInput,
  onPortInputChange,
  lookingUp,
  knownPorts,
  onLookup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portInput: string;
  onPortInputChange: (v: string) => void;
  lookingUp: boolean;
  knownPorts: number[];
  onLookup: (e?: React.FormEvent) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("system.portLookupTitle")}</DialogTitle>
          <DialogDescription>
            {t("system.portLookupDescription")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex items-center gap-2 p-3"
          onSubmit={(e) => void onLookup(e)}
        >
          <Input
            value={portInput}
            onChange={(e) => onPortInputChange(e.target.value)}
            inputMode="numeric"
            placeholder={t("system.portPlaceholder")}
            className="h-8"
            autoFocus
          />
          <Button type="submit" size="sm" loading={lookingUp}>
            {t("system.portFind")}
          </Button>
        </form>
        {knownPorts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 p-3">
            {knownPorts.slice(0, 24).map((port) => (
              <button
                key={port}
                type="button"
                onClick={() => {
                  onPortInputChange(String(port));
                  void onLookup();
                }}
                className="hover:bg-accent rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-none"
              >
                {port}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>
            {t("common.close")}
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
