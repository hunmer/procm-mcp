import { Badge } from "@/registry/default/ui/badge";
import {
  CardAction,
  CardHeader,
} from "@/registry/default/ui/card";
import { Button } from "@/registry/default/ui/button";
import { ExternalLinkIcon, PinIcon, PinOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "../StatusBadge";
import type { ProcessView } from "@/lib/types";

// Header of a process card: name + status badge + description, with pin /
// unread-log badges in the action slot. Rendered as the card's first child so
// the ContextMenuTrigger (the Card itself) wraps both header and panel.
export function ProcessCardBody({
  p,
  unreadCount,
  pinned,
  onTogglePin,
}: {
  p: ProcessView;
  unreadCount: number;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const { t } = useTranslation();
  const port = typeof p.port === "number" ? p.port : null;
  const portHref = port ? `http://localhost:${port}` : null;
  return (
    <CardHeader className="border-b p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm font-semibold">
            {p.name}
          </span>
          <StatusBadge status={p.status} error={p.error} />
        </div>
        {p.desc ? (
          <span
            className="text-muted-foreground line-clamp-1 text-xs"
            title={p.desc ?? undefined}
          >
            {p.desc}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </div>
      <CardAction className="row-span-1 self-center">
        <div className="flex items-center gap-1.5">
          {/* Pin floats the row to the top of its group, regardless of the
              selected sort order. */}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={pinned ? t("processes.unpinAria", { name: p.name }) : t("processes.pinAria", { name: p.name })}
            title={pinned ? t("processes.unpinTitle") : t("processes.pinTitle")}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={
              pinned
                ? "text-primary"
                : "text-muted-foreground opacity-60 hover:opacity-100"
            }
          >
            {pinned ? <PinIcon /> : <PinOffIcon />}
          </Button>
          {/* One-click open of the process's served URL. stopPropagation keeps
              the click from also selecting the card / opening the context menu. */}
          {portHref && (
            <Badge
              variant="secondary"
              className="tabular-nums"
              render={
                <a
                  href={portHref}
                  target="_blank"
                  rel="noreferrer"
                  title={t("processes.openPortTitle", { port })}
                  aria-label={t("processes.openPortAria", { port })}
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <ExternalLinkIcon />
              {port}
            </Badge>
          )}
          {unreadCount > 0 ? (
            <Badge variant="info" className="tabular-nums">
              {unreadCount > 999 ? "999+" : unreadCount}
            </Badge>
          ) : null}
        </div>
      </CardAction>
    </CardHeader>
  );
}
