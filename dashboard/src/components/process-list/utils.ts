import type { ProcessView } from "@/lib/types";

// Whether a process can currently be stopped (running/spawning). Anything else
// (stopped/exited/error) renders a Run/Restart affordance instead. Centralizes
// the check that the card buttons, the context menu, requestStop/requestDelete,
// and the delete dialog all need so they can't drift apart.
export function canStopProcess(p: ProcessView): boolean {
  return p.stoppedAt == null && p.status !== "exited" && p.status !== "error";
}

// Label of the catch-all bucket for processes without a group. Shared by the
// grouped view and the board view so both bucket the same rows.
export const UNGROUPED = "Ungrouped";

export function groupKeyOf(group: string | undefined): string {
  const value = (group ?? "").trim();
  return value || UNGROUPED;
}
