import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadIcon, FolderOpenIcon } from "lucide-react";
import { batchImportProcesses, scanDirectory, selectDirectory, type ScanCandidate } from "@/lib/api";
import { Button } from "@/registry/default/ui/button";
import { Checkbox } from "@/registry/default/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle, DialogTrigger } from "@/registry/default/ui/dialog";
import { Field, FieldLabel } from "@/registry/default/ui/field";
import { Input } from "@/registry/default/ui/input";

export function ImportGroupDialog({
  onToast,
  open: openProp,
  onOpenChange,
  defaultGroup,
}: {
  onToast: (message: string, isError?: boolean) => void;
  // Controlled mode: when open/onOpenChange are provided the dialog is driven
  // from outside (e.g. the header "+" menu) and the built-in trigger button
  // is not rendered.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Group pre-filled into the form when the dialog opens (e.g. the group
  // whose header "+" menu triggered the import). Browsing still overrides it
  // with the picked folder's name.
  defaultGroup?: string;
}) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [path, setPath] = useState("");
  const [group, setGroup] = useState("");
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  // Re-seed the group field from defaultGroup on every open so opening from a
  // group header pre-fills that group, and a plain reopen clears it.
  useEffect(() => {
    if (open) setGroup(defaultGroup ?? "");
  }, [open, defaultGroup]);

  async function scan(dir = path) {
    const target = dir.trim();
    if (!target) return;
    setBusy(true);
    try {
      const found = await scanDirectory(target);
      setCandidates(found);
      // Keep the current checkbox selection across rescans; only clamp to
      // indices that still exist.
      setSelected((current) => {
        const alive = new Set<number>();
        for (const index of current) if (index < found.length) alive.add(index);
        return alive;
      });
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  }

  // Native OS directory picker, relayed by the backend (popups-file-dialog).
  // Fills the path input and rescans in one go; cancelling is a no-op.
  async function browse() {
    if (busy) return;
    setBusy(true);
    try {
      const dir = await selectDirectory();
      if (dir) {
        setPath(dir);
        // Pre-fill the group with the picked folder's name (last path
        // segment, Windows or POSIX separators).
        setGroup(dir.split(/[\\/]+/).filter(Boolean).pop() ?? "");
        await scan(dir);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  }

  async function importSelected() {
    const items = candidates.filter((_, index) => selected.has(index));
    if (!items.length || !group.trim()) return;
    setBusy(true);
    try {
      // One batch request instead of N parallel ones — the backend writes
      // them in a single serialized pass.
      const r = await batchImportProcesses(items, group.trim());
      onToast(t("toasts.importedAll", { count: r.imported.length }));
      setOpen(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {openProp === undefined && (
        <DialogTrigger render={<Button variant="outline" size="icon" />}>
          <DownloadIcon />
          <span className="sr-only">{t("favorites.importTitle")}</span>
        </DialogTrigger>
      )}
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("favorites.importTitle")}</DialogTitle>
          <DialogDescription>{t("importDialog.description")}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <Field>
            <FieldLabel>{t("importDialog.folderLabel")}</FieldLabel>
            <div className="flex gap-2">
              {/* Auto-scan on blur: typed paths scan as soon as the field
                  loses focus, picked paths scan right after browse(). */}
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onBlur={() => scan()}
                placeholder="C:\\project"
              />
              <Button type="button" size="icon" onClick={browse} loading={busy} aria-label={t("importDialog.browse")} title={t("importDialog.browse")}><FolderOpenIcon /></Button>
            </div>
          </Field>
          <Field>
            <FieldLabel>{t("dialogs.form.groupLabel")}</FieldLabel>
            <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder={t("dialogs.form.groupPlaceholder")} />
          </Field>
          <div className="max-h-56 space-y-2 overflow-auto">
            {candidates.length > 0 && (
              <label className="flex items-center gap-2 border-b pb-2 text-sm font-medium">
                <Checkbox
                  checked={selected.size === candidates.length}
                  onCheckedChange={(checked) => setSelected(checked ? new Set(candidates.map((_, index) => index)) : new Set())}
                />
                {t("importDialog.selectAll")}
              </label>
            )}
            {candidates.map((candidate, index) => (
              <label key={`${candidate.cwd}-${candidate.name ?? candidate.script}-${index}`} className="flex items-start gap-2 text-sm">
                <Checkbox checked={selected.has(index)} onCheckedChange={(checked) => setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(index); else next.delete(index);
                  return next;
                })} />
                <span className="min-w-0"><span className="block truncate font-medium">{candidate.name ?? candidate.script}</span><code className="text-muted-foreground block truncate text-xs">{candidate.script} {candidate.args.join(" ")}</code></span>
              </label>
            ))}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={importSelected} loading={busy} disabled={!group.trim() || selected.size === 0}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
