import { useTranslation } from "react-i18next";
import {
  DownloadIcon,
  EllipsisVerticalIcon,
  EraserIcon,
  FolderOpenIcon,
  FolderTreeIcon,
  TerminalIcon,
} from "lucide-react";
import { CopyIconButton } from "@/components/CopyIconButton";
import { Button } from "@/registry/default/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@/registry/default/ui/menu";

// Footer toolbar: per-log view toggles + copy text (left), line count +
// overflow actions dropdown (right). Stateless — handlers and counts come in
// as props so LogPanel owns the state.
export function LogPanelFooter({
  getCopyText,
  onClearLogs,
  canStop,
  showStdin,
  onToggleStdin,
  grep,
  searching,
  loading,
  totalEntries,
  visibleCount,
  onCopyLocation,
  onRevealLogFile,
  onDownloadLog,
}: {
  getCopyText: () => string | null;
  onClearLogs: () => void;
  canStop: boolean;
  showStdin: boolean;
  onToggleStdin: () => void;
  grep: string;
  searching: boolean;
  loading: boolean;
  totalEntries: number;
  visibleCount: number;
  onCopyLocation: () => void;
  onRevealLogFile: () => void;
  onDownloadLog: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center justify-between gap-1 border-t px-2 py-1.5">
      <div className="flex items-center gap-1">
        {/* Copy button with anchored "已复制" toast (coss p-toast-7 pattern);
            the count mirrors what handleCopyText built in LogPanel. */}
        <CopyIconButton
          getValue={getCopyText}
          tooltip={t("logs.copyLogsTitle")}
          ariaLabel={t("logs.copyLogsAria")}
          toastTitle={t("logs.toastCopiedLines", { count: visibleCount })}
          emptyToastTitle={t("logs.toastNothingToCopy")}
        />
        {/* Clear-view button. Ctrl+C and other signals moved to the stdin
            bar's snippets menu. */}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("logs.clearLogsAria")}
          title={t("logs.clearLogsTitle")}
          onClick={onClearLogs}
        >
          <EraserIcon />
        </Button>
        {/* Toggle the stdin input bar (only meaningful for a live process).
            Hidden by default so the log view stays uncluttered; the active
            variant shows when input is on. */}
        {canStop && (
          <Button
            size="icon-sm"
            variant={showStdin ? "default" : "ghost"}
            aria-pressed={showStdin}
            aria-label={t("logs.toggleStdinAria")}
            title={
              showStdin ? t("logs.hideStdin") : t("logs.showStdin")
            }
            onClick={onToggleStdin}
          >
            <TerminalIcon />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground px-1 text-[11px] tabular-nums">
          {grep
            ? searching
              ? t("logs.countSearching")
              : t("logs.countMatches", { count: totalEntries })
            : loading
              ? t("logs.countLoading")
              : t("logs.countLines", { count: visibleCount })}
        </span>
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("logs.moreActions")}
                title={t("logs.moreActions")}
              />
            }
          >
            <EllipsisVerticalIcon />
          </MenuTrigger>
          <MenuPopup>
            <MenuItem onClick={onRevealLogFile}>
              <FolderOpenIcon aria-hidden="true" />
              {t("logs.revealLogFile")}
            </MenuItem>
            <MenuItem onClick={onCopyLocation}>
              <FolderTreeIcon aria-hidden="true" />
              {t("logs.copyLocation")}
            </MenuItem>
            <MenuItem onClick={onDownloadLog}>
              <DownloadIcon aria-hidden="true" />
              {t("logs.downloadLog")}
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </div>
  );
}
