import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2Icon } from "lucide-react";
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
  FieldError,
  FieldLabel,
} from "@/registry/default/ui/field";
import { GroupIcon } from "./GroupIcon";

const MAX_ICON_BYTES = 512 * 1024;

// Snapshot from click time: the display label of the clicked group, the input
// seed ("" for the Ungrouped bucket), and the ids of every process that will
// be moved (count kept for the description interpolation).
export interface PendingGroupRename {
  label: string;
  seed: string;
  count: number;
  ids: string[];
  imageIcon?: string;
}

interface RenameGroupDialogProps {
  group: PendingGroupRename | null;
  onOpenChange: (open: boolean) => void;
  // Apply the new group name ("" = move to Ungrouped). Resolves when done;
  // error reporting is the parent's job.
  onSubmit: (value: string, imageIcon?: string) => Promise<void>;
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
  const [imageIcon, setImageIcon] = useState<string | undefined>();
  const [iconError, setIconError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-seed the input from the clicked group on every open.
  useEffect(() => {
    if (group) {
      setValue(group.seed);
      setImageIcon(group.imageIcon);
      setIconError("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [group]);

  function handleIconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setIconError(t("processes.groupIconTypeError"));
      e.target.value = "";
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setIconError(t("processes.groupIconSizeError"));
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageIcon(reader.result);
        setIconError("");
      }
    };
    reader.onerror = () => setIconError(t("processes.groupIconReadError"));
    reader.readAsDataURL(file);
  }

  function clearIcon() {
    setImageIcon(undefined);
    setIconError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!group || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(value.trim(), imageIcon);
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
                type="text"
                autoFocus
                placeholder={t("processes.renameGroupPlaceholder")}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <FieldDescription>
                {t("processes.renameGroupHelp")}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="rename-group-icon-input">
                {t("processes.groupIconLabel")}
              </FieldLabel>
              <div className="flex w-full items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                  <GroupIcon imageIcon={imageIcon} className="size-7" />
                </div>
                <Input
                  ref={fileInputRef}
                  id="rename-group-icon-input"
                  type="file"
                  nativeInput
                  accept="image/*"
                  aria-invalid={iconError ? true : undefined}
                  onChange={handleIconChange}
                />
                {imageIcon && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("processes.removeGroupIcon")}
                    title={t("processes.removeGroupIcon")}
                    onClick={clearIcon}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
              <FieldDescription>{t("processes.groupIconHelp")}</FieldDescription>
              {iconError && <FieldError>{iconError}</FieldError>}
            </Field>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" loading={submitting} disabled={!!iconError}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
