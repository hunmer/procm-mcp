import { useTranslation } from "react-i18next";
import type { Table } from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/registry/default/ui/pagination";
import type { ProcessView } from "@/lib/types";

// The footer: "Viewing X–Y of N" (+ page x/y when paginated) and prev/next
// buttons wired to the table instance. The range numbers are computed by the
// orchestrator from the pagination state.
export function ProcessPagination({
  table,
  rangeStart,
  rangeEnd,
  rowCount,
  pageCount,
  pageIndex,
}: {
  table: Table<ProcessView>;
  rangeStart: number;
  rangeEnd: number;
  rowCount: number;
  pageCount: number;
  pageIndex: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2.5">
      <span className="text-muted-foreground whitespace-nowrap text-xs">
        {t("processes.paginationViewing", {
          start: rangeStart,
          end: rangeEnd,
          total: rowCount,
        })}
        {pageCount > 1 &&
          t("processes.paginationPage", { page: pageIndex + 1, pages: pageCount })}
      </span>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t("processes.previousPage")}
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeftIcon />
            </Button>
          </PaginationItem>
          <PaginationItem>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={t("processes.nextPage")}
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRightIcon />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
