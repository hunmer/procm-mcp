import { Badge } from "@/registry/default/ui/badge";
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

export function StatusBadge({ status }: { status: ProcessStatus }) {
  return (
    <Badge variant={VARIANT[status]} className="capitalize">
      {status}
    </Badge>
  );
}
