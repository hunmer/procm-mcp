import { useState } from "react";
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
// just flip the matching open flag.
export function CreateDropdown({
  onStarted,
  onError,
  onToast,
}: {
  onStarted: (id: string) => void;
  onError: (message: string) => void;
  onToast: (message: string, isError?: boolean) => void;
}) {
  const { t } = useTranslation();
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <Menu>
        <MenuTrigger
          render={<Button variant="outline" size="icon" />}
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
        onStarted={onStarted}
        onError={onError}
      />
      <ImportGroupDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onToast={onToast}
      />
    </>
  );
}
