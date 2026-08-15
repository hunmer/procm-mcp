import type { Column } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { ProcessRow } from "./types";

// A clickable column header that toggles sort direction via the column's own
// handler and shows the current direction with an icon. Mirrors the shared
// process-list SortableHeader, but typed for SystemProcess rows.
export function SortableHeader({
  column,
  label,
}: {
  column: Column<ProcessRow>;
  label: string;
}) {
  const dir = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className="group inline-flex items-center gap-1 whitespace-nowrap"
    >
      {label}
      <span className="text-muted-foreground inline-flex">
        {dir === "asc" ? (
          <ArrowUpIcon className="size-3.5" />
        ) : dir === "desc" ? (
          <ArrowDownIcon className="size-3.5" />
        ) : (
          <ArrowDownIcon className="size-3.5 opacity-0 group-hover:opacity-50" />
        )}
      </span>
    </button>
  );
}
