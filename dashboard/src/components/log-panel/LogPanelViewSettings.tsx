import { useTranslation } from "react-i18next";
import { SettingsIcon } from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import { Checkbox } from "@/registry/default/ui/checkbox";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@/registry/default/ui/popover";
import { Separator } from "@/registry/default/ui/separator";
import type { FontSize } from "./types";

// View settings: a popover (stays open while toggling) holding the per-log
// view toggles + font-size picker, collapsed behind a gear so the
// quick-filter row stays compact. Fully controlled; persistence of all
// toggles to localStorage lives in useLogPanelViewState.
export function LogPanelViewSettings({
  showTime,
  onShowTimeChange,
  showLineNumbers,
  onShowLineNumbersChange,
  autoScroll,
  onAutoScrollChange,
  showJson,
  onShowJsonChange,
  fontSize,
  onFontSizeChange,
  colorizeBackground,
  onColorizeBackgroundChange,
}: {
  showTime: boolean;
  onShowTimeChange: (v: boolean) => void;
  showLineNumbers: boolean;
  onShowLineNumbersChange: (v: boolean) => void;
  autoScroll: boolean;
  onAutoScrollChange: (v: boolean) => void;
  showJson: boolean;
  onShowJsonChange: (v: boolean) => void;
  fontSize: FontSize;
  onFontSizeChange: (v: FontSize) => void;
  colorizeBackground: boolean;
  onColorizeBackgroundChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            className="ms-auto"
            aria-label={t("logs.viewSettingsAria")}
            title={t("logs.viewSettingsTitle")}
          />
        }
      >
        <SettingsIcon />
      </PopoverTrigger>
      <PopoverPopup className="w-60">
        {/* Toggles: timestamps, line numbers, auto-scroll. */}
        <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
          <Checkbox
            checked={showTime}
            onCheckedChange={(v) => onShowTimeChange(v)}
          />
          {t("logs.timestampsOption")}
        </label>
        <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
          <Checkbox
            checked={showLineNumbers}
            onCheckedChange={(v) => onShowLineNumbersChange(v)}
          />
          {t("logs.lineNumbersOption")}
        </label>
        <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
          <Checkbox
            checked={autoScroll}
            onCheckedChange={(v) => onAutoScrollChange(v)}
          />
          {t("logs.autoScrollOption")}
        </label>
        <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
          <Checkbox
            checked={showJson}
            onCheckedChange={(v) => onShowJsonChange(v)}
          />
          {t("logs.jsonOption")}
        </label>
        <label className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
          <Checkbox checked={colorizeBackground} onCheckedChange={(v) => onColorizeBackgroundChange(v)} />
          {t("logs.backgroundColorOption")}
        </label>
        <Separator className="my-1" />
        {/* Font size: segmented pick of small / medium / large. */}
        <div className="px-1 pb-1">
          <span className="text-muted-foreground px-1 text-xs">
            {t("logs.fontSizeOption")}
          </span>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {(["xs", "sm", "md"] as const).map((size, i) => (
              <Button
                key={size}
                size="xs"
                variant={fontSize === size ? "default" : "outline"}
                aria-pressed={fontSize === size}
                onClick={() => onFontSizeChange(size)}
              >
                {[
                  t("logs.fontSizeSmall"),
                  t("logs.fontSizeMedium"),
                  t("logs.fontSizeLarge"),
                ][i]}
              </Button>
            ))}
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
