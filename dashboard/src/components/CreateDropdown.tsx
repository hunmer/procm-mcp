import { type ReactElement, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderInputIcon, PlusIcon } from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@/registry/default/ui/menu";
import { ImportGroupDialog } from "./ImportGroupDialog";
import { NewProcessDialog } from "./NewProcessDialog";

// Header "+" overflow menu: create a process directly or import a batch of
// them from a directory. The dialogs are controlled here — the menu items
// just flip the matching open flag. Also used as the per-group "+" in the
// process list, with the clicked group pre-filled into both dialogs.
export function CreateDropdown({
  onStarted,
  onCreated,
  onError,
  onToast,
  defaultGroup,
  defaultImportGroup,
  groupOptions,
  trigger,
}: {
  onStarted: (id: string) => void;
  // Fired when a process was created without starting (checkbox unticked).
  onCreated?: (id: string) => void;
  onError: (message: string) => void;
  onToast: (message: string, isError?: boolean) => void;
  // Group pre-filled into the new-process dialog when it opens.
  defaultGroup?: string;
  // Group pre-filled into the import dialog when it opens.
  defaultImportGroup?: string;
  // Existing group labels offered in the new-process group combobox.
  groupOptions?: string[];
  // MenuTrigger render element; defaults to the header's outline icon button.
  trigger?: ReactElement;
}) {
  const { t } = useTranslation();
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <Menu>
        <MenuTrigger
          render={trigger ?? <Button variant="outline" size="icon" />}
          aria-label={t("header.create")}
          title={t("header.create")}
        >
          <PlusIcon />
        </MenuTrigger>
        <MenuPopup>
          <MenuItem onClick={() => setNewOpen(true)}>
            <PlusIcon aria-hidden="true" />
            {t("header.newProcess")}
          </MenuItem>
          <MenuItem onClick={() => setImportOpen(true)}>
            <FolderInputIcon aria-hidden="true" />
            {t("header.importFromDirectory")}
          </MenuItem>
        </MenuPopup>
      </Menu>
      <NewProcessDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        defaultGroup={defaultGroup}
        groupOptions={groupOptions}
        onStarted={onStarted}
        onCreated={onCreated}
        onError={onError}
      />
      <ImportGroupDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        defaultGroup={defaultImportGroup}
        onToast={onToast}
      />
    </>
  );
}
