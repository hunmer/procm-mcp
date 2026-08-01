import { Badge } from "@/registry/default/ui/badge";
import {
  PreviewCard,
  PreviewCardPopup,
  PreviewCardTrigger,
} from "@/registry/default/ui/preview-card";
import type { ProcessStatus } from "@/lib/types";

const VARIANT: Record<
  ProcessStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  running: "success",
  spawning: "warning",
  exited: "secondary",
  error: "error",
};

export function StatusBadge({
  status,
  error,
}: {
  status: ProcessStatus;
  // Optional error detail. When present (e.g. a process's `error` field), the
  // badge is wrapped in a hover/focus preview card that surfaces the message.
  error?: string | null;
}) {
  const badge = (
    <Badge variant={VARIANT[status]} className="capitalize">
      {status}
    </Badge>
  );

  // No error to surface: render the plain badge.
  if (!error) return badge;

  return (
    <PreviewCard>
      <PreviewCardTrigger
        render={<span className="inline-flex cursor-default" />}
      >
        {badge}
      </PreviewCardTrigger>
      <PreviewCardPopup className="max-w-xs">
        <div className="flex flex-col gap-1">
          <p className="text-destructive text-xs font-semibold">
            {status === "error" ? "Process error" : "Details"}
          </p>
          <p className="text-popover-foreground break-words text-xs">
            {error}
          </p>
        </div>
      </PreviewCardPopup>
    </PreviewCard>
  );
}
