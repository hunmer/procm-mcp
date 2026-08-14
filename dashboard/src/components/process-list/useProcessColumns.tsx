import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/registry/default/ui/badge";
import { StatusBadge } from "../StatusBadge";
import { favoriteSignature } from "@/lib/favorites";
import type { ProcessView } from "@/lib/types";
import { formatUptime } from "./utils";
import { SortableHeader } from "./SortableHeader";
import { ProcessActions } from "./ProcessActions";

interface UseProcessColumnsArgs {
  now: number;
  unread: Record<string, number>;
  favoritedSignatures: Set<string>;
  onToggleFavorite: (p: ProcessView) => void;
  onRestart: (id: string) => void;
  onRequestStop: (p: ProcessView) => void;
  onRequestDelete: (p: ProcessView) => void;
}

// Builds the TanStack column definitions for the process table. The actions
// cell reuses <ProcessActions> so the table and the card footer stay in sync.
export function useProcessColumns({
  now,
  unread,
  favoritedSignatures,
  onToggleFavorite,
  onRestart,
  onRequestStop,
  onRequestDelete,
}: UseProcessColumnsArgs): ColumnDef<ProcessView>[] {
  const { t } = useTranslation();
  return useMemo<ColumnDef<ProcessView>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <SortableHeader column={column}>{t("processes.colName")}</SortableHeader>
        ),
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{p.name}</span>
              <StatusBadge status={p.status} error={p.error} />
            </div>
          );
        },
      },
      {
        id: "command",
        header: t("processes.colCommand"),
        cell: ({ row }) => {
          const p = row.original;
          const cmd = `${p.script}${p.args?.length ? " " + p.args.join(" ") : ""}`;
          return <code className="text-sm">{cmd}</code>;
        },
      },
      {
        id: "desc",
        header: t("processes.colDescription"),
        cell: ({ row }) => {
          const desc = row.original.desc;
          return desc ? (
            <span
              className="text-muted-foreground line-clamp-1 max-w-[220px] text-sm"
              title={desc}
            >
              {desc}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          );
        },
      },
      {
        // Creation time. Sorted by default (newest-first). Uses startedAt from
        // the persisted record; live processes without startedAt sort as "now".
        id: "createdAt",
        accessorFn: (p) => p.startedAt ?? 0,
        header: ({ column }) => (
          <SortableHeader column={column}>{t("processes.colCreated")}</SortableHeader>
        ),
        cell: ({ row }) => {
          const t = row.original.startedAt;
          return (
            <span
              className="text-muted-foreground text-xs tabular-nums"
              title={t ? new Date(t).toLocaleString() : undefined}
            >
              {t ? new Date(t).toLocaleString() : "—"}
            </span>
          );
        },
      },
      {
        // "Time since last restart". Only shown for live processes
        // (running/spawning); stopped/exited/error rows render a dash. Uses
        // lastStartedAt (reset on every restart), falling back to startedAt
        // for records that predate the field. The parent's `now` ticks every
        // second so the value stays current.
        id: "uptime",
        // Sort by elapsed uptime (now - since). Stopped/exited rows have no
        // meaningful uptime, so they sort as Infinity — last on ascending (the
        // shortest-lived first), matching their "—" display. Depends on `now`,
        // so the sort key tracks the live display.
        accessorFn: (p) => {
          const live = p.status === "running" || p.status === "spawning";
          const since = p.lastStartedAt ?? p.startedAt;
          return live && since != null ? Math.max(0, now - since) : Infinity;
        },
        header: ({ column }) => (
          <SortableHeader column={column}>{t("processes.colUptime")}</SortableHeader>
        ),
        cell: ({ row }) => {
          const p = row.original;
          const live = p.status === "running" || p.status === "spawning";
          const since = p.lastStartedAt ?? p.startedAt;
          if (!live || since == null) {
            return <span className="text-muted-foreground text-xs">—</span>;
          }
          const uptime = formatUptime(Math.max(0, now - since));
          return (
            <span
              className="text-muted-foreground font-mono text-xs tabular-nums"
              title={new Date(since).toLocaleString()}
            >
              {uptime}
            </span>
          );
        },
      },
      {
        accessorKey: "pid",
        header: t("processes.colPid"),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.pid != null ? row.original.pid : "—"}
          </span>
        ),
      },
      {
        accessorKey: "exitCode",
        header: t("processes.colExit"),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.exitCode != null ? row.original.exitCode : "—"}
          </span>
        ),
      },
      {
        // Unread live-log count since the panel for this process was last open.
        // Shows a badge only when there are unseen lines.
        id: "unread",
        header: t("processes.colLogs"),
        cell: ({ row }) => {
          const count = unread[row.original.id] ?? 0;
          return count > 0 ? (
            <Badge variant="info" className="tabular-nums">
              {count > 999 ? "999+" : count}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">{t("processes.colActions")}</div>,
        cell: ({ row }) => (
          <ProcessActions
            process={row.original}
            favorited={favoritedSignatures.has(favoriteSignature(row.original))}
            onToggleFavorite={onToggleFavorite}
            onRestart={onRestart}
            onStop={onRequestStop}
            onDelete={onRequestDelete}
            align="end"
          />
        ),
      },
    ],
    // `t` is included so headers refresh on language change; the action
    // callbacks are stable in behavior (they close over setState + onToast +
    // `t`, all of which are covered here), matching the original memo.
    [now, unread, favoritedSignatures, onToggleFavorite, t],
  );
}
