import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SkullIcon } from "lucide-react";
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
import { Checkbox } from "@/registry/default/ui/checkbox";
import { Input } from "@/registry/default/ui/input";
import type { ProcessRow } from "./types";
import { SystemProcessInfo } from "./SystemProcessInfo";

// Kill confirmation. Killing is irreversible, so confirm with the pid + name
// up front. By default only the selected process(es) die; the checkbox opts
// in to taking the whole descendant tree down too. Driven by the pendingKill
// state from the parent; closing clears it.
export function KillConfirmDialog({
  pendingKill,
  onDismiss,
  onConfirm,
}: {
  pendingKill: ProcessRow | null;
  onDismiss: () => void;
  onConfirm: (row: ProcessRow, tree: boolean) => void;
}) {
  const { t } = useTranslation();
  // Reset to the safe default every time the dialog is armed.
  const [tree, setTree] = useState(false);
  useEffect(() => {
    if (pendingKill) setTree(false);
  }, [pendingKill]);
  return (
    <AlertDialog
      open={pendingKill != null}
      onOpenChange={(o) => !o && onDismiss()}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("system.killConfirmTitle")}</AlertDialogTitle>
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
        <label className="-mt-3 flex cursor-pointer items-center gap-2 px-6 text-sm">
          <Checkbox
            checked={tree}
            onCheckedChange={(v) => setTree(v === true)}
            aria-label={t("system.killTreeLabel")}
          />
          {t("system.killTreeLabel")}
        </label>
        <AlertDialogFooter variant="bare">
          <AlertDialogClose render={<Button variant="ghost" />}>
            {t("common.cancel")}
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button variant="destructive" />}
            onClick={() => pendingKill && onConfirm(pendingKill, tree)}
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
  onReveal,
}: {
  viewing: ProcessRow | null;
  onDismiss: () => void;
  onCopy: (value: string, label: string) => void;
  onReveal?: (row: ProcessRow) => void;
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
          <SystemProcessInfo
            row={viewing}
            onCopy={onCopy}
            onReveal={onReveal}
          />
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

// Toolbar "view port" lookup: enter a port (or click a quick-pick chip — it
// searches with that port immediately), the backend runs find-process, and
// the owning process is shown inline. When a process is found the footer
// gains a Kill button that arms the shared kill confirmation.
export function PortLookupDialog({
  open,
  onOpenChange,
  portInput,
  onPortInputChange,
  lookingUp,
  knownPorts,
  result,
  onLookup,
  onCopy,
  onKill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portInput: string;
  onPortInputChange: (v: string) => void;
  lookingUp: boolean;
  knownPorts: number[];
  // The process found by the last lookup (null = none yet / last lookup
  // missed) — rendered inline with a Kill action in the footer.
  result: ProcessRow | null;
  // `port` is the value to search (explicit so chip clicks don't race the
  // controlled input state); `e` is only passed by the form submit.
  onLookup: (port: number, e?: React.FormEvent) => void;
  onCopy: (value: string, label: string) => void;
  onKill: (row: ProcessRow) => void;
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
          onSubmit={(e) => void onLookup(Number(portInput), e)}
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
                  void onLookup(port);
                }}
                className="hover:bg-accent rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-none"
              >
                {port}
              </button>
            ))}
          </div>
        )}
        {result && <SystemProcessInfo row={result} onCopy={onCopy} />}
        <DialogFooter>
          {result && (
            <Button variant="destructive" onClick={() => onKill(result)}>
              <SkullIcon aria-hidden="true" />
              {t("system.kill")}
            </Button>
          )}
          <DialogClose render={<Button variant="ghost" />}>
            {t("common.close")}
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
