import { useTranslation } from "react-i18next";
import { XIcon } from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import type { ProcessRow } from "./types";
import { SystemProcessInfo } from "./SystemProcessInfo";

// The right-hand info panel. Clicking a row selects it here; the body reuses
// the same SystemProcessInfo as the "view info" dialog so the two stay in
// sync. Closes (deselects) via the × button.
export function SystemProcessInfoPanel({
  row,
  onClose,
  onCopy,
  onReveal,
}: {
  row: ProcessRow;
  onClose: () => void;
  onCopy: (value: string, label: string) => void;
  onReveal: (row: ProcessRow) => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="bg-card flex h-full w-[420px] shrink-0 flex-col border-l">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" title={row.name}>
            {row.name}
          </div>
          <div className="text-muted-foreground font-mono text-xs tabular-nums">
            {row.members.length > 1
              ? t("system.groupCount", { count: row.members.length })
              : `PID ${row.pid}`}
          </div>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        <SystemProcessInfo row={row} onCopy={onCopy} onReveal={onReveal} />
      </div>
    </aside>
  );
}
