import type { Column } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { ProcessView } from "@/lib/types";

// A clickable column header that toggles sort direction (asc → desc → cleared)
// and shows the current direction with an icon. Used by the sortable columns.
export function SortableHeader({
  column,
  children,
}: {
  column: Column<ProcessView>;
  children: React.ReactNode;
}) {
  const dir = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className="group inline-flex items-center gap-1 whitespace-nowrap"
    >
      {children}
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
