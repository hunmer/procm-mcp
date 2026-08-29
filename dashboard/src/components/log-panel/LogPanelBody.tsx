import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { CircleOffIcon, FileTextIcon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/registry/default/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import { ScrollArea } from "@/registry/default/ui/scroll-area";
import type { LogEntry } from "@/lib/types";
import type { FontSize } from "./types";
import { TerminalLog } from "../TerminalLog";

// The log body: a dark "terminal" surface so the ANSI color palette renders
// with the contrast its authors intended (mirrors the embedded-terminal
// convention used by VS Code / xterm). The log-selectable class re-enables
// text selection (disabled app-wide) so users can copy lines. Receives the
// already-filtered entries plus the view toggles and formatting helpers.
export function LogPanelBody({
  closedNotice,
  error,
  entries,
  grep,
  showTime,
  showLineNumbers,
  showJson,
  formatTime,
  highlight,
  fontTextClass,
  fontLineClass,
  fontSize,
  onFontSizeChange,
  backgroundMode,
  loading = false,
  notice,
  errorText,
  loadingText,
  emptyTitle,
  emptyDescription,
}: {
  closedNotice: boolean;
  error: string | null;
  entries: LogEntry[];
  grep: string;
  showTime: boolean;
  showLineNumbers: boolean;
  showJson: boolean;
  formatTime: (ts: number) => string;
  highlight: RegExp | null;
  fontTextClass: string;
  fontLineClass: string;
  fontSize?: FontSize;
  onFontSizeChange?: (size: FontSize) => void;
  backgroundMode: "none" | "level" | "client";
  loading?: boolean;
  notice?: ReactNode;
  errorText?: string;
  loadingText?: ReactNode;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <ScrollArea className="log-selectable bg-zinc-950 text-zinc-300 min-h-0 flex-1">
      <div className="min-h-full p-4">
        {notice}
        {closedNotice && (
          <Alert variant="warning" className="mb-3">
            <CircleOffIcon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <AlertTitle>{t("logs.closedNoticeTitle")}</AlertTitle>
              <AlertDescription>
                {t("logs.closedNoticeDesc")}
              </AlertDescription>
            </div>
          </Alert>
        )}
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <span className="text-zinc-500">{loadingText}</span>
          </div>
        ) : error ? (
          <pre className={`m-0 whitespace-pre-wrap break-words ${fontTextClass} ${fontLineClass}`}>
            <span className="text-red-400">{errorText ?? t("logs.errorPrefix", { message: error })}</span>
          </pre>
        ) : entries.length === 0 ? (
          <Empty className="min-h-[200px] text-zinc-400">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-zinc-800 text-zinc-400">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle className="text-zinc-300">
                {emptyTitle ?? (grep ? t("logs.emptyNoMatches") : t("logs.emptyNoLogs"))}
              </EmptyTitle>
              <EmptyDescription className="text-zinc-500">
                {grep
                  ? t("logs.emptyNoMatchesDesc", { grep })
                  : (emptyDescription ?? t("logs.emptyNoLogsDesc"))}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <TerminalLog
            entries={entries}
            showTime={showTime}
            showLineNumbers={showLineNumbers}
            showJson={showJson}
            formatTime={formatTime}
            highlight={highlight}
            backgroundMode={backgroundMode}
            className={`${fontTextClass} ${fontLineClass}`}
            fontSize={fontSize}
            onFontSizeChange={onFontSizeChange}
          />
        )}
      </div>
    </ScrollArea>
  );
}
