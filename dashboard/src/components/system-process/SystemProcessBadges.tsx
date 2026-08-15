import { useTranslation } from "react-i18next";
import { GlobeIcon } from "lucide-react";

// A ×N badge marking a merged row — several processes sharing the same name
// and parent collapsed into one. Purely informational; the member list lives
// in the info panel/dialog.
export function CountBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <span
      className="text-muted-foreground inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-none"
      title={t("system.groupBadgeTitle", { count })}
    >
      ×{count}
    </span>
  );
}

// A listening-port badge shown next to a process name. Clicking opens
// http://localhost:<port> in a new tab; stopPropagation keeps the row's
// context-menu trigger from also firing.
export function PortBadge({ port }: { port: number }) {
  const { t } = useTranslation();
  return (
    <a
      href={`http://localhost:${port}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="hover:bg-accent inline-flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-none"
      title={t("system.portBadgeTitle", { port })}
    >
      <GlobeIcon className="size-2.5" />
      {port}
    </a>
  );
}
