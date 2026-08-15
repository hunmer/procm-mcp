import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  EllipsisIcon,
  FileTextIcon,
  PlayIcon,
  RotateCwIcon,
  SquareIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@/registry/default/ui/menu";
import type { ProcessView } from "@/lib/types";
import { canStopProcess } from "./utils";
import { ProcessLogFilesDialog } from "./ProcessLogFilesDialog";

// The per-process action buttons (favorite / restart-or-run / stop / delete).
// Shared by the table's actions cell and the card footer so both stay in sync.
// `align="end"` right-aligns (table cell); omitted → left-aligned (card footer).
export function ProcessActions({
  process,
  favorited,
  onToggleFavorite,
  onRestart,
  onStop,
  onDelete,
  align,
}: {
  process: ProcessView;
  favorited: boolean;
  onToggleFavorite: (p: ProcessView) => void;
  onRestart: (id: string) => void;
  onStop: (p: ProcessView) => void;
  onDelete: (p: ProcessView) => void;
  align?: "end";
}) {
  const { t } = useTranslation();
  const p = process;
  // Whether the process can currently be stopped — mirrors the context-menu
  // Stop item (running/spawning only). Anything else shows a Play button.
  const canStop = canStopProcess(p);
  // The log-files dropdown's dialog (on-disk .log files for this process).
  const [logFilesOpen, setLogFilesOpen] = useState(false);
  return (
    <div
      className={"flex gap-1.5" + (align === "end" ? " justify-end" : "")}
      // Prevent row/card-click (open logs) when interacting with an action.
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={
          favorited
            ? t("processes.removeFavoriteAria", { name: p.name })
            : t("processes.addFavoriteAria", { name: p.name })
        }
        title={
          favorited
            ? t("processes.removeFavoriteTitle")
            : t("processes.addFavoriteTitle")
        }
        onClick={() => onToggleFavorite(p)}
        className={favorited ? "text-warning" : "text-muted-foreground"}
      >
        <StarIcon className={favorited ? "fill-current" : undefined} />
      </Button>
      {canStop ? (
        <>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("processes.restartAria", { name: p.name })}
            title={t("processes.restartTitle")}
            onClick={() => onRestart(p.id)}
            className="text-muted-foreground hover:text-success"
          >
            <RotateCwIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("processes.stopAria", { name: p.name })}
            title={t("processes.stopTitle")}
            onClick={() => onStop(p)}
            className="text-muted-foreground hover:text-warning"
          >
            <SquareIcon />
          </Button>
        </>
      ) : (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("processes.runAria", { name: p.name })}
          title={t("processes.runTitle")}
          onClick={() => onRestart(p.id)}
          className="text-muted-foreground hover:text-success"
        >
          <PlayIcon />
        </Button>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t("processes.deleteAria", { name: p.name })}
        title={t("processes.deleteTitle")}
        onClick={() => onDelete(p)}
        className="text-muted-foreground hover:text-destructive"
      >
        <TrashIcon />
      </Button>
      {/* Overflow menu: view this process's on-disk log files (dialog with the
          file list + terminal content). */}
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("processes.viewLogFilesAria", { name: p.name })}
              title={t("processes.viewLogFilesTitle")}
              className="text-muted-foreground"
            />
          }
        >
          <EllipsisIcon />
        </MenuTrigger>
        <MenuPopup>
          <MenuItem onClick={() => setLogFilesOpen(true)}>
            <FileTextIcon aria-hidden="true" />
            {t("processes.viewLogFiles")}
          </MenuItem>
        </MenuPopup>
      </Menu>
      <ProcessLogFilesDialog
        process={p}
        open={logFilesOpen}
        onOpenChange={setLogFilesOpen}
      />

    </div>
  );
}
