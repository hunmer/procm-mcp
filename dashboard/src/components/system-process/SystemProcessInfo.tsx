import { useTranslation } from "react-i18next";
import { CopyIcon, FolderSearchIcon } from "lucide-react";
import { Badge } from "@/registry/default/ui/badge";
import { Button } from "@/registry/default/ui/button";
import type { ProcessRow } from "./types";
import { exePathOfRow } from "./utils";

// The read-only process info body rendered inside the "View info" dialog and
// the right-hand panel. A definition-list grid of the row's shared identity
// fields — every value is right-aligned and gets a copy button revealed on
// row hover. Merged rows replace the single PID/command entries with a brief
// per-member list — pid + command line, the only fields that differ within a
// group — with the same hover-to-copy affordance on the command.
export function SystemProcessInfo({
  row,
  onCopy,
  onReveal,
}: {
  row: ProcessRow;
  onCopy: (value: string, label: string) => void;
  // Opens the executable's folder in the OS file manager; the path row's
  // locate-folder button is hidden when absent or no path resolves.
  onReveal?: (row: ProcessRow) => void;
}) {
  const { t } = useTranslation();
  const merged = row.members.length > 1;
  const exe = exePathOfRow(row);
  const protectedPid = row.members.some((m) => m.pid <= 4);
  return (
    <div className="flex flex-col gap-1 py-1 p-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
        <InfoRow
          label={t("system.colName")}
          copyValue={row.name}
          copyLabel={t("common.copy")}
          onCopy={onCopy}
        >
          <span className="font-medium">{row.name}</span>
          {protectedPid && (
            <Badge variant="outline" size="sm" className="ml-2">
              {t("system.protectedTitle")}
            </Badge>
          )}
        </InfoRow>
        <InfoRow
          label={t("system.colPid")}
          mono={!merged}
          copyValue={
            merged
              ? row.members.map((m) => String(m.pid)).join(", ")
              : String(row.pid)
          }
          copyLabel={t("common.copy")}
          onCopy={onCopy}
        >
          {merged
            ? t("system.groupCount", { count: row.members.length })
            : String(row.pid)}
        </InfoRow>
        <InfoRow
          label={t("system.colPpid")}
          mono
          copyValue={String(row.ppid)}
          copyLabel={t("common.copy")}
          onCopy={onCopy}
        >
          {String(row.ppid)}
        </InfoRow>
        <InfoRow
          label={t("system.colPath")}
          copyValue={exe ?? undefined}
          copyLabel={t("system.copyPath")}
          onCopy={onCopy}
          action={
            exe && onReveal ? (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground -mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={t("system.ctxOpenLocation")}
                title={t("system.ctxOpenLocation")}
                onClick={() => onReveal(row)}
              >
                <FolderSearchIcon />
              </Button>
            ) : undefined
          }
        >
          {exe ? (
            <code className="bg-muted block w-full break-all rounded px-2 py-1 text-right font-mono text-xs">
              {exe}
            </code>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          )}
        </InfoRow>
        {!merged && (
          <InfoRow
            label={t("system.colCommand")}
            copyValue={row.cmd ?? undefined}
            copyLabel={t("system.copyCommand")}
            onCopy={onCopy}
          >
            {row.cmd ? (
              <code className="bg-muted block w-full break-all rounded px-2 py-1 text-right font-mono text-xs">
                {row.cmd}
              </code>
            ) : (
              <span className="text-muted-foreground/50 text-xs">—</span>
            )}
          </InfoRow>
        )}
      </dl>
      {merged && (
        <div className="mt-1 flex flex-col gap-1.5 border-t pt-2.5">
          <div className="text-muted-foreground text-xs font-medium">
            {t("system.groupMembers")}
          </div>
          {row.members.map((m) => (
            <div key={m.pid} className="group flex items-center gap-2 text-xs">
              <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                {m.pid}
              </span>
              <span
                className="text-muted-foreground min-w-0 flex-1 truncate font-mono"
                title={m.cmd ?? m.name}
              >
                {m.cmd ?? "—"}
              </span>
              {m.cmd && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={t("system.copyCommand")}
                  title={t("system.copyCommand")}
                  onClick={() =>
                    onCopy(m.cmd as string, t("system.colCommand"))
                  }
                >
                  <CopyIcon />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A label/value row in the info grid. The value is right-aligned; when
// `copyValue` is set, a copy button appears beside it on row hover (kept in
// place with opacity so the layout never shifts). `action` renders an extra
// hover button before the copy one (the path row's locate-folder). `mono`
// renders the value in a monospace face (used for numeric PIDs).
function InfoRow({
  label,
  mono,
  copyValue,
  copyLabel,
  onCopy,
  action,
  children,
}: {
  label: string;
  mono?: boolean;
  copyValue?: string;
  copyLabel: string;
  onCopy: (value: string, label: string) => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground pt-0.5 whitespace-nowrap">
        {label}
      </dt>
      <dd
        className={`group flex items-start justify-end gap-1 ${
          mono ? "font-mono text-xs tabular-nums" : ""
        }`}
      >
        <div className="min-w-0 flex-1 text-right">{children}</div>
        {action}
        {copyValue && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground -mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label={copyLabel}
            title={copyLabel}
            onClick={() => onCopy(copyValue, label)}
          >
            <CopyIcon />
          </Button>
        )}
      </dd>
    </>
  );
}
