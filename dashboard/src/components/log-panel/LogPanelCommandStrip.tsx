import { useTranslation } from "react-i18next";
import { SquareTerminalIcon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/registry/default/ui/alert";

// Launch command strip: a compact, read-only display of how the process was
// started. Rendered by the parent once the command resolves (live: full
// command with envs; closed: best-effort reconstruction from public fields).
export function LogPanelCommandStrip({ command }: { command: string }) {
  const { t } = useTranslation();
  return (
    <Alert
      variant="info"
      className="shrink-0 gap-2 rounded-none border-x-0 border-t-0 px-4 py-2"
    >
      <SquareTerminalIcon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <AlertTitle className="text-xs">{t("logs.commandLabel")}</AlertTitle>
        <AlertDescription className="text-foreground break-all font-mono text-xs">
          {command}
        </AlertDescription>
      </div>
    </Alert>
  );
}
