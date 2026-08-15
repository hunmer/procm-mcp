import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { SkullIcon } from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import { Spinner } from "@/registry/default/ui/spinner";
import type { ProcessRow } from "./types";
import { SortableHeader } from "./SortableHeader";
import { CountBadge, PortBadge } from "./SystemProcessBadges";

// The column definitions for the System table. `killingPid` drives the
// per-row pending spinner in the actions column; `onKill` arms the kill
// confirmation dialog (doesn't kill directly).
export function useSystemProcessColumns({
  killingPid,
  onKill,
}: {
  killingPid: number | null;
  onKill: (row: ProcessRow) => void;
}): ColumnDef<ProcessRow>[] {
  const { t } = useTranslation();
  return useMemo<ColumnDef<ProcessRow>[]>(
    () => [
      {
        accessorKey: "name",
        // Fixed width: long names wrap onto multiple lines instead of
        // truncating or squeezing the other columns (applied to the header
        // and cells via colWidthClass below).
        meta: { className: "w-[240px] min-w-[240px] max-w-[240px]" },
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colName")} />
        ),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span
                className="font-medium min-w-0 flex-1 break-words"
                title={r.cmd ?? r.name}
              >
                {r.name}
              </span>
              {r.members.length > 1 && (
                <CountBadge count={r.members.length} />
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "pid",
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colPid")} />
        ),
        cell: ({ row }) => (
          <span className="text-foreground/80 font-mono text-xs tabular-nums">
            {row.original.pid}
          </span>
        ),
      },
      {
        accessorKey: "ppid",
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colPpid")} />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {row.original.ppid}
          </span>
        ),
      },
      {
        id: "ports",
        // Sort by the lowest listening port (0 = none) — see sortValue in utils.
        accessorFn: (p) => p.ports?.[0] ?? 0,
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colPorts")} />
        ),
        cell: ({ row }) => {
          const ports = row.original.ports;
          return ports?.length ? (
            <div className="flex flex-wrap gap-1">
              {ports.map((port) => (
                <PortBadge key={port} port={port} />
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          );
        },
      },
      {
        id: "path",
        accessorFn: (p) => p.exe ?? "",
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colPath")} />
        ),
        cell: ({ row }) => {
          const exe = row.original.exe;
          return exe ? (
            <span
              className="text-muted-foreground block max-w-[280px] truncate font-mono text-xs"
              title={exe}
            >
              {exe}
            </span>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          );
        },
      },
      {
        id: "command",
        accessorFn: (p) => p.cmd ?? "",
        header: ({ column }) => (
          <SortableHeader column={column} label={t("system.colCommand")} />
        ),
        cell: ({ row }) => {
          const cmd = row.original.cmd;
          return cmd ? (
            <span
              className="text-muted-foreground block max-w-[360px] truncate font-mono text-xs"
              title={cmd}
            >
              {cmd}
            </span>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          );
        },
      },
      {
        id: "actions",
        // Pinned right; not sortable.
        enableSorting: false,
        header: () => <span className="sr-only">{t("system.colActions")}</span>,
        cell: ({ row }) => {
          const r = row.original;
          // The backend refuses protected pids (idle/system/self); disable the
          // obvious kernel slots client-side so they read as non-actionable.
          const protectedPid = r.members.some((m) => m.pid <= 4);
          const isKilling = killingPid === r.pid;
          return (
            <div className="flex justify-end">
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={protectedPid || isKilling}
                aria-label={t("system.killAria", { name: r.name, pid: r.pid })}
                title={
                  protectedPid ? t("system.protectedTitle") : t("system.killTitle")
                }
                className="text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onKill(r);
                }}
              >
                {isKilling ? <Spinner className="size-3.5" /> : <SkullIcon />}
              </Button>
            </div>
          );
        },
      },
    ],
    [t, killingPid, onKill],
  );
}
