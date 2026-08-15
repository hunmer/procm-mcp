import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DownloadIcon, SearchIcon } from "lucide-react";
import { saveImportedProcess, scanDirectory, type ScanCandidate } from "@/lib/api";
import { Button } from "@/registry/default/ui/button";
import { Checkbox } from "@/registry/default/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle, DialogTrigger } from "@/registry/default/ui/dialog";
import { Field, FieldLabel } from "@/registry/default/ui/field";
import { Input } from "@/registry/default/ui/input";

export function ImportGroupDialog({
  onToast,
}: {
  onToast: (message: string, isError?: boolean) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [group, setGroup] = useState("");
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  async function scan() {
    if (!path.trim()) return;
    setBusy(true);
    try {
      const found = await scanDirectory(path.trim());
      setCandidates(found);
      setSelected(new Set());
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
      await Promise.all(items.map((item) => saveImportedProcess({
        ...item,
        name: item.name,
        cwd: item.cwd,
        group: group.trim(),
      })));
      onToast(t("toasts.importedAll", { count: items.length }));
      setOpen(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="icon" />}>
        <DownloadIcon />
        <span className="sr-only">{t("favorites.importTitle")}</span>
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("favorites.importTitle")}</DialogTitle>
          <DialogDescription>{t("importDialog.description")}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <Field>
            <FieldLabel>{t("importDialog.folderLabel")}</FieldLabel>
            <div className="flex gap-2">
              <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="C:\\project" />
              <Button type="button" size="icon" onClick={scan} loading={busy} aria-label={t("importDialog.scan")} title={t("importDialog.scan")}><SearchIcon /></Button>
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
