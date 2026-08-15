import { useTranslation } from "react-i18next";
import { CopyIcon } from "lucide-react";
import { Badge } from "@/registry/default/ui/badge";
import { Button } from "@/registry/default/ui/button";
import type { ProcessRow } from "./types";
import { exePathOfRow } from "./utils";

// The read-only process info body rendered inside the "View info" dialog and
// the right-hand panel. A definition-list grid of the row's shared identity
// fields (the long path value gets a copy button). Merged rows replace the
// single PID/command entries with a brief per-member list — pid + command
// line, the only fields that differ within a group — kept action-free.
export function SystemProcessInfo({
  row,
  onCopy,
}: {
  row: ProcessRow;
  onCopy: (value: string, label: string) => void;
}) {
  const { t } = useTranslation();
  const merged = row.members.length > 1;
  const exe = exePathOfRow(row);
  const protectedPid = row.members.some((m) => m.pid <= 4);
  return (
    <div className="flex flex-col gap-1 py-1 p-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
        <InfoRow label={t("system.colName")}>
          <span className="font-medium">{row.name}</span>
          {protectedPid && (
            <Badge variant="outline" size="sm" className="ml-2">
              {t("system.protectedTitle")}
            </Badge>
          )}
        </InfoRow>
        <InfoRow label={t("system.colPid")} mono={!merged}>
          {merged
            ? t("system.groupCount", { count: row.members.length })
            : String(row.pid)}
        </InfoRow>
        <InfoRow label={t("system.colPpid")} mono>
          {String(row.ppid)}
        </InfoRow>
        <InfoRow label={t("system.colPath")}>
          {exe ? (
            <CopyableText
              value={exe}
              onCopy={() => onCopy(exe, t("system.colPath"))}
              copyLabel={t("system.copyPath")}
            />
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          )}
        </InfoRow>
        {!merged && (
          <InfoRow label={t("system.colCommand")}>
            {row.cmd ? (
              <CopyableText
                value={row.cmd}
                onCopy={() => onCopy(row.cmd as string, t("system.colCommand"))}
                copyLabel={t("system.copyCommand")}
              />
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
            <div key={m.pid} className="flex items-center gap-2 text-xs">
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
                  className="text-muted-foreground shrink-0"
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

// A label/value row in the info grid. `mono` renders the value in a monospace
// face (used for numeric PIDs).
function InfoRow({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground pt-0.5 whitespace-nowrap">{label}</dt>
      <dd className={mono ? "font-mono text-xs tabular-nums" : undefined}>
        {children}
      </dd>
    </>
  );
}

// A long, copyable value: monospace, wraps with break-all, with a trailing
// copy icon button so paths/commands can be grabbed verbatim.
function CopyableText({
  value,
  onCopy,
  copyLabel,
}: {
  value: string;
  onCopy: () => void;
  copyLabel: string;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <code className="bg-muted block min-w-0 flex-1 break-all rounded px-2 py-1 font-mono text-xs">
        {value}
      </code>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground shrink-0"
        aria-label={copyLabel}
        title={copyLabel}
        onClick={onCopy}
      >
        <CopyIcon />
      </Button>
    </div>
  );
}
