import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/registry/default/ui/dialog";
import { Button } from "@/registry/default/ui/button";
import { Input } from "@/registry/default/ui/input";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/registry/default/ui/field";

// Snapshot from click time: the display label of the clicked group, the input
// seed ("" for the Ungrouped bucket), and the ids of every process that will
// be moved (count kept for the description interpolation).
export interface PendingGroupRename {
  label: string;
  seed: string;
  count: number;
  ids: string[];
}

interface RenameGroupDialogProps {
  group: PendingGroupRename | null;
  onOpenChange: (open: boolean) => void;
  // Apply the new group name ("" = move to Ungrouped). Resolves when done;
  // error reporting is the parent's job.
  onSubmit: (value: string) => Promise<void>;
}

// Group-header "edit" dialog: type a target group name and every process of
// the clicked group is moved there (a rename is just a move of the whole set).
export function RenameGroupDialog({
  group,
  onOpenChange,
  onSubmit,
}: RenameGroupDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Re-seed the input from the clicked group on every open.
  useEffect(() => {
    if (group) setValue(group.seed);
  }, [group]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!group || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(value.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={group != null} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("processes.renameGroupTitle")}</DialogTitle>
          <DialogDescription>
            {group &&
              t("processes.renameGroupDescription", {
                label: group.label,
                count: group.count,
              })}
          </DialogDescription>
        </DialogHeader>
        <form className="contents" onSubmit={handleSubmit}>
          <DialogPanel>
            <Field>
              <FieldLabel htmlFor="rename-group-input">
                {t("processes.renameGroupLabel")}
              </FieldLabel>
              <Input
                id="rename-group-input"
                autoFocus
                placeholder={t("processes.renameGroupPlaceholder")}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <FieldDescription>
                {t("processes.renameGroupHelp")}
              </FieldDescription>
            </Field>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" loading={submitting}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
