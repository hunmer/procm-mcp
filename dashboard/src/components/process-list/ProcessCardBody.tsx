import { useState } from "react";
import { Badge } from "@/registry/default/ui/badge";
import {
  CardAction,
  CardHeader,
} from "@/registry/default/ui/card";
import { Button } from "@/registry/default/ui/button";
import { ExternalLinkIcon, InfoIcon, PinIcon, PinOffIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "../StatusBadge";
import {
  KillConfirmDialog,
  PortLookupDialog,
} from "../system-process/SystemProcessDialogs";
import { rowOfProcess } from "../system-process/utils";
import type { ProcessRow } from "../system-process/types";
import { findProcessByPort, killSystemProcess } from "@/lib/api";
import type { ProcessView } from "@/lib/types";

// Header of a process card: name + status badge + description, with pin /
// unread-log badges in the action slot. Rendered as the card's first child so
// the ContextMenuTrigger (the Card itself) wraps both header and panel.
export function ProcessCardBody({
  p,
  isActive,
  unreadCount,
  pinned,
  onTogglePin,
}: {
  p: ProcessView;
  isActive: boolean;
  unreadCount: number;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const { t } = useTranslation();
  const port = typeof p.port === "number" ? p.port : null;
  const portHref = port ? `http://localhost:${port}` : null;

  // The info icon next to the port badge opens the shared "view port" lookup
  // pre-filled with the card's port: it resolves the OS process listening on
  // that port and offers the same Kill (with confirmation) as the System tab.
  const [lookupOpen, setLookupOpen] = useState(false);
  const [portInput, setPortInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<ProcessRow | null>(null);
  const [pendingKill, setPendingKill] = useState<ProcessRow | null>(null);

  async function handleLookup(port: number, e?: React.FormEvent) {
    e?.preventDefault();
    if (!Number.isFinite(port) || port < 1 || port > 65535) return;
    setLookingUp(true);
    setLookupResult(null);
    try {
      const found = await findProcessByPort(port);
      if (found.length > 0) setLookupResult(rowOfProcess(found[0]));
    } catch {
      // lookup failure leaves the dialog empty; re-submitting retries
    } finally {
      setLookingUp(false);
    }
  }

  function openPortLookup(port: number) {
    setPortInput(String(port));
    setLookupOpen(true);
    void handleLookup(port);
  }

  function closePortLookup() {
    setLookupOpen(false);
    setLookupResult(null);
  }

  // Tree-kill every member on confirm. The card list refreshes itself over
  // the websocket when the killed process was procm-managed.
  async function confirmKill(row: ProcessRow) {
    setPendingKill(null);
    try {
      for (const m of row.members) await killSystemProcess(m.pid);
    } catch {
      // kill refused/failed: the confirm dialog is already closed; retry by
      // reopening the lookup and killing again
    }
  }

  return (
    <>
      <CardHeader
        className={`overflow-hidden rounded-t-[calc(var(--radius-2xl)-1px)] border-b p-4 ${
          isActive
            ? "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]"
            : ""
        }`}
      >
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
            {/* One-click open of the process's served URL, with an info icon
              beside it that looks up the port's owning OS process (killable).
              stopPropagation keeps clicks from also selecting the card. */}
            {port != null && portHref && (
              <>
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
                <button
                  type="button"
                  aria-label={t("processes.infoAria", { port })}
                  title={t("processes.infoTitle")}
                  onClick={(e) => {
                    e.stopPropagation();
                    openPortLookup(port);
                  }}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <InfoIcon className="size-3.5" />
                </button>
              </>
            )}
            {unreadCount > 0 ? (
              <Badge variant="info" className="tabular-nums">
                {unreadCount > 999 ? "999+" : unreadCount}
              </Badge>
            ) : null}
          </div>
        </CardAction>
      </CardHeader>
      <PortLookupDialog
        open={lookupOpen}
        onOpenChange={(o) => (o ? setLookupOpen(true) : closePortLookup())}
        portInput={portInput}
        onPortInputChange={setPortInput}
        lookingUp={lookingUp}
        knownPorts={[]}
        result={lookupResult}
        onLookup={handleLookup}
        onCopy={async (value) => {
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            // clipboard unavailable (e.g. insecure context) — nothing to do
          }
        }}
        onKill={(row) => {
          closePortLookup();
          setPendingKill(row);
        }}
      />
      <KillConfirmDialog
        pendingKill={pendingKill}
        onDismiss={() => setPendingKill(null)}
        onConfirm={(row) => void confirmKill(row)}
      />
    </>
  );
}
