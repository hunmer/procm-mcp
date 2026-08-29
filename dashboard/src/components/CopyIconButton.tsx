import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useCopyToClipboard } from "@/registry/default/hooks/use-copy-to-clipboard";
import { Button } from "@/registry/default/ui/button";
import { anchoredToastManager } from "@/registry/default/ui/toast";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "@/registry/default/ui/tooltip";

const TOAST_TIMEOUT = 2000;

// Copy button following coss particle p-toast-7: clicking copies the value,
// swaps CopyIcon for a transient CheckIcon and pops a tooltip-style toast
// anchored to the button ("已复制") instead of a global toast. getValue runs at
// click time; returning null/empty shows emptyToastTitle (nothing copied) and
// skips the clipboard write.
export function CopyIconButton({
  getValue,
  tooltip,
  ariaLabel,
  toastTitle,
  emptyToastTitle,
  size = "icon-sm",
  variant = "ghost",
  className,
}: {
  getValue: () => string | null;
  tooltip: string;
  ariaLabel?: string;
  toastTitle?: string;
  emptyToastTitle?: string;
  size?: "icon" | "icon-xs" | "icon-sm";
  variant?: "ghost" | "outline" | "secondary";
  className?: string;
}) {
  const { t } = useTranslation();
  const copyButtonRef = useRef<HTMLButtonElement>(null);

  const { copyToClipboard, isCopied } = useCopyToClipboard({
    timeout: TOAST_TIMEOUT,
    onCopy: () => {
      if (copyButtonRef.current) {
        anchoredToastManager.add({
          data: {
            tooltipStyle: true,
          },
          positionerProps: {
            anchor: copyButtonRef.current,
          },
          timeout: TOAST_TIMEOUT,
          title: toastTitle ?? t("common.copied"),
        });
      }
    },
  });

  function handleCopy() {
    const value = getValue();
    if (!value) {
      if (emptyToastTitle && copyButtonRef.current) {
        anchoredToastManager.add({
          data: {
            tooltipStyle: true,
          },
          positionerProps: {
            anchor: copyButtonRef.current,
          },
          timeout: TOAST_TIMEOUT,
          title: emptyToastTitle,
        });
      }
      return;
    }
    copyToClipboard(value);
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={ariaLabel ?? tooltip}
            className={className}
            disabled={isCopied}
            onClick={handleCopy}
            ref={copyButtonRef}
            size={size}
            variant={variant}
          />
        }
      >
        {isCopied ? (
          <CheckIcon className="size-4" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </TooltipTrigger>
      <TooltipPopup>
        <p>{tooltip}</p>
      </TooltipPopup>
    </Tooltip>
  );
}
