import { useEffect, useState } from "react";
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
import { Checkbox } from "@/registry/default/ui/checkbox";
import { CheckboxGroup } from "@/registry/default/ui/checkbox-group";
import { Label } from "@/registry/default/ui/label";
import { InboxIcon, SearchIcon } from "lucide-react";
import { scanDirectory, type ScanCandidate } from "@/lib/api";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import { makeFavoriteId, type Favorite } from "@/lib/favorites";

interface ImportFavoritesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Imported favorites are passed back to the caller (App) which persists them
  // via the favorites hook and reports a de-dup summary toast. The caller is
  // responsible for the actual add + duplicate handling.
  onImport: (favs: Favorite[]) => void;
  onToast: (message: string, isError?: boolean) => void;
}

// Convert a selected candidate into a Favorite. The category is the scanned
// folder's absolute path, so every imported favorite lands under one group.
function candidateToFavorite(c: ScanCandidate, category: string): Favorite {
  return {
    id: makeFavoriteId(),
    script: c.script,
    args: c.args,
    cwd: c.cwd,
    name: c.name,
    desc: c.desc,
    category,
    createdAt: Date.now(),
  };
}

export function ImportFavoritesDialog({
  open,
  onOpenChange,
  onImport,
  onToast,
}: ImportFavoritesDialogProps) {
  // Folder path being typed / scanned. `scannedPath` freezes the path that the
  // currently-displayed candidates came from, so the category label is stable
  // even if the user edits the input after a scan.
  const [path, setPath] = useState("");
  const [scannedPath, setScannedPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  // CheckboxGroup values are strings; we key candidates by their index.
  const [selected, setSelected] = useState<string[]>([]);

  // Reset everything when the dialog is (re)opened, so a fresh open starts
  // blank regardless of the last session.
  useEffect(() => {
    if (!open) return;
    setPath("");
    setScannedPath("");
    setScanning(false);
    setError(null);
    setCandidates([]);
    setSelected([]);
  }, [open]);

  const allValues = candidates.map((_, i) => String(i));
  const allSelected =
    candidates.length > 0 && selected.length === candidates.length;

  async function runScan() {
    const dir = path.trim();
    if (!dir) return;
    setScanning(true);
    setError(null);
    setCandidates([]);
    setSelected([]);
    try {
      const found = await scanDirectory(dir);
      setScannedPath(dir);
      setCandidates(found);
      // Default to everything ticked so a one-click "import all" is possible.
      setSelected(found.map((_, i) => String(i)));
      if (found.length === 0) {
        onToast("No project commands found in that folder");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  function handleSubmit() {
    if (selected.length === 0 || !scannedPath) return;
    const chosen = selected
      .map((i) => candidates[Number(i)])
      .filter((c): c is ScanCandidate => c != null)
      .map((c) => candidateToFavorite(c, scannedPath));
    if (chosen.length === 0) return;
    onImport(chosen);
    onOpenChange(false);
  }

  // Toggle every candidate on/off via the parent checkbox.
  function toggleAll(nextChecked: boolean) {
    setSelected(nextChecked ? allValues : []);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Import from folder</DialogTitle>
          <DialogDescription>
            Scan a folder for project commands (package.json, pyproject.toml,
            Cargo.toml) and import the ones you want as favorites. The folder
            path becomes the favorites category.
          </DialogDescription>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            // Enter in the path field triggers a scan; a second Enter with
            // results present imports the selection.
            if (candidates.length > 0 && selected.length > 0) handleSubmit();
            else runScan();
          }}
        >
          <DialogPanel>
            <Field>
              <FieldLabel htmlFor="imp-path">Folder path</FieldLabel>
              <div className="flex gap-2 w-full">
                <Input
                  id="imp-path"
                  placeholder="/path/to/project"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  className="font-mono text-xs min-w-0 flex-1"
                  spellCheck={false}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={runScan}
                  loading={scanning}
                  disabled={!path.trim() || scanning}
                >
                  <SearchIcon />
                  Scan
                </Button>
              </div>
              <FieldDescription>
                Only the folder&apos;s top level is scanned.
              </FieldDescription>
            </Field>

            {error && (
              <p className="text-destructive mt-3 text-xs">{error}</p>
            )}

            {candidates.length > 0 && (
              <div className="mt-4">
                <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs">
                  <span>
                    {candidates.length} command
                    {candidates.length === 1 ? "" : "s"} found
                    {scannedPath && (
                      <>
                        {" "}in{" "}
                        <code className="text-foreground/80 break-all">
                          {scannedPath}
                        </code>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleAll(!allSelected)}
                    className="hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                </div>
                <CheckboxGroup
                  allValues={allValues}
                  value={selected}
                  onValueChange={setSelected}
                  className="max-h-[40vh] gap-1"
                >
                  {/* Parent checkbox: tri-state via indeterminate. */}
                  <Label className="border-b pb-2">
                    <Checkbox
                      parent
                      indeterminate={
                        selected.length > 0 && !allSelected
                      }
                      checked={allSelected}
                      onCheckedChange={(checked) =>
                        toggleAll(checked === true)
                      }
                    />
                    <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                      {selected.length} selected
                    </span>
                  </Label>
                  {candidates.map((c, i) => {
                    const cmd = `${c.script}${
                      c.args.length ? " " + c.args.join(" ") : ""
                    }`;
                    return (
                      <Label
                        key={`${c.script}-${c.args.join(" ")}-${i}`}
                        className="hover:bg-accent/50 rounded-md px-1.5 py-1"
                      >
                        <Checkbox value={String(i)} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">
                            {c.name ?? c.script}
                          </span>
                          <code className="text-muted-foreground truncate bg-transparent text-xs">
                            {cmd}
                          </code>
                        </span>
                      </Label>
                    );
                  })}
                </CheckboxGroup>
              </div>
            )}

            {/* No results yet (and not currently scanning a valid path). */}
            {!scanning &&
              candidates.length === 0 &&
              !error &&
              scannedPath && (
                <div className="mt-4">
                  <Empty className="py-8">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <InboxIcon />
                      </EmptyMedia>
                      <EmptyTitle>No commands found</EmptyTitle>
                      <EmptyDescription>
                        This folder has no recognized project manifest, or its
                        manifest defines no scripts.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              )}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={selected.length === 0 || !scannedPath}
            >
              Import {selected.length > 0 ? `(${selected.length})` : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
