import { useTranslation } from "react-i18next";
import {
  EllipsisIcon,
  SendIcon,
  SquareTerminalIcon,
} from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import { Textarea } from "@/registry/default/ui/textarea";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/registry/default/ui/menu";

// Stdin input bar: write text directly to the process's standard input.
// Uses an auto-sizing textarea (field-sizing-content grows with input).
// Enter submits; Shift+Enter inserts a newline. The dots menu inserts
// common snippets / signals. Stateless — submit/append/signal handlers are
// owned by LogPanel and passed in as props.
export function LogPanelStdinBar({
  processName,
  value,
  onValueChange,
  onSubmit,
  sending,
  onAppendSnippet,
  onSendSignal,
}: {
  processName: string;
  value: string;
  onValueChange: (v: string) => void;
  onSubmit: () => void | Promise<void>;
  sending: boolean;
  onAppendSnippet: (text: string) => void;
  onSendSignal: (signal: string, label: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-end gap-1.5 border-t px-2 py-1.5">
      <Textarea
        size="sm"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void onSubmit();
          }
        }}
        placeholder={t("logs.inputPlaceholder")}
        disabled={sending}
        rows={1}
        className="max-h-40 text-xs"
      />
      {/* Snippets dropdown: insert common stdin snippets or deliver an OS
          signal (Ctrl+C / Ctrl+D / SIGTERM / SIGHUP). Plain text is
          appended to the box; signals are sent immediately. */}
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("logs.snippetsAria")}
              title={t("logs.snippetsTitle")}
              className="shrink-0"
            />
          }
        >
          <EllipsisIcon />
        </MenuTrigger>
        <MenuPopup>
          <MenuItem
            onClick={() => onSendSignal("SIGINT", t("logs.snippetCtrlC"))}
          >
            <SquareTerminalIcon aria-hidden="true" />
            {t("logs.snippetCtrlC")}
          </MenuItem>
          <MenuItem
            onClick={() => onSendSignal("SIGTERM", t("logs.snippetSigterm"))}
          >
            <SquareTerminalIcon aria-hidden="true" />
            {t("logs.snippetSigterm")}
          </MenuItem>
          <MenuItem
            onClick={() => onSendSignal("SIGHUP", t("logs.snippetSighup"))}
          >
            <SquareTerminalIcon aria-hidden="true" />
            {t("logs.snippetSighup")}
          </MenuItem>
          <MenuItem onClick={() => onAppendSnippet("\u0004")}>
            {t("logs.snippetCtrlD")}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => onAppendSnippet("\n")}>
            {t("logs.snippetNewline")}
          </MenuItem>
          <MenuItem onClick={() => onAppendSnippet("yes")}>
            {t("logs.snippetYes")}
          </MenuItem>
          <MenuItem onClick={() => onAppendSnippet("no")}>
            {t("logs.snippetNo")}
          </MenuItem>
          <MenuItem onClick={() => onAppendSnippet("exit")}>
            {t("logs.snippetExit")}
          </MenuItem>
          <MenuItem onClick={() => onAppendSnippet("clear")}>
            {t("logs.snippetClear")}
          </MenuItem>
        </MenuPopup>
      </Menu>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t("logs.sendAria", { name: processName })}
        title={t("logs.sendTitle")}
        onClick={onSubmit}
        disabled={sending || !value}
        className="shrink-0"
      >
        <SendIcon />
      </Button>
    </div>
  );
}
