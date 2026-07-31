import { useCallback, useEffect, useState } from "react";
import { Button } from "@/registry/default/ui/button";
import { MoonIcon, PanelLeftOpenIcon, SunIcon } from "lucide-react";
import { NewProcessDialog } from "./NewProcessDialog";
import { ProcessList } from "./ProcessList";
import { LogPanel } from "./LogPanel";
import { Toast } from "./Toast";
import { useTheme } from "@/lib/useTheme";
import { useDashboardSocket } from "@/lib/ws";
import type { ProcessListResponse, ProcessView } from "@/lib/types";

export function App() {
  const [data, setData] = useState<ProcessListResponse | null>(null);
  const [meta, setMeta] = useState("loading…");
  const [selected, setSelected] = useState<ProcessView | null>(null);
  // The log panel collapses/expands independently of which process is selected,
  // so closing it keeps the selection and lets you reopen to the same logs.
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    isError?: boolean;
    key: number;
  } | null>(null);
  const { theme, toggle } = useTheme();

  const { status, reconnectInMs, onProcessesMessage, onLogMessage } =
    useDashboardSocket();

  // Live updates from the backend: replace the process list and keep the
  // selected log target in sync with the latest view. This replaces the old
  // 3s polling loop.
  onProcessesMessage((m) => {
    setData({
      serverId: m.serverId ?? data?.serverId ?? "",
      pid: m.pid ?? data?.pid ?? 0,
      processes: m.data,
    });
    setMeta(
      `server ${m.serverId ?? ""}${m.pid ? ` (pid ${m.pid})` : ""} · ${new Date().toLocaleTimeString()}`,
    );
    setSelected((cur) =>
      cur ? m.data.find((p) => p.id === cur.id) ?? null : null,
    );
  });

  // Drop the selected process if it no longer exists (e.g. after being stopped).
  useEffect(() => {
    if (selected && data && !data.processes.some((p) => p.id === selected.id)) {
      setSelected(null);
    }
  }, [data, selected]);

  const showToast = useCallback(
    (message: string, isError?: boolean) =>
      setToast({ message, isError, key: Date.now() }),
    [],
  );

  const processes = data?.processes ?? [];

  const statusMeta =
    status === "open"
      ? "connected"
      : status === "connecting"
        ? "connecting…"
        : reconnectInMs != null
          ? `reconnecting in ${Math.ceil(reconnectInMs / 1000)}s`
          : "reconnecting…";

  return (
    <div className="flex h-full flex-col">
      <header className="bg-card sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight">procm-mcp</h1>
          <p className="text-muted-foreground truncate text-xs">{meta}</p>
        </div>
        <div className="flex items-center gap-2">
          <NewProcessDialog
            onStarted={(id) => showToast(`Started: ${id}`)}
            onError={(m) => showToast(m, true)}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={toggle}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
          {/* Live connection indicator: green=open, yellow=connecting,
              red=closed/reconnecting. Replaces the old "auto (3s)" poll toggle. */}
          <span
            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground"
            title={statusMeta}
          >
            <span
              className={
                "inline-block size-2 rounded-full " +
                (status === "open"
                  ? "bg-green-500"
                  : status === "connecting"
                    ? "bg-yellow-500"
                    : "bg-red-500")
              }
            />
            {statusMeta}
          </span>
        </div>
      </header>

      {/* Inline left/right split: selecting a process's logs opens the right
          column, which squeezes the left process list (no overlay). */}
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-auto p-5">
          <div className="bg-card mb-0 rounded-xl border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">
                Processes
                {processes.length > 0 && (
                  <span className="text-muted-foreground ml-2 text-xs">
                    ({processes.length})
                  </span>
                )}
              </h2>
            </div>
            <ProcessList
              processes={processes}
              selectedId={selected?.id ?? null}
              onSelectLogs={(p) => {
                setSelected(p);
                setLogCollapsed(false);
              }}
              onToast={showToast}
            />
          </div>
        </main>

        {selected && !logCollapsed && (
          <div className="w-full max-w-[min(640px,46vw)] shrink-0">
            <LogPanel
              process={selected}
              onClose={() => setLogCollapsed(true)}
              onLogMessage={onLogMessage}
            />
          </div>
        )}
      </div>

      {/* When the log panel is collapsed but a process is selected, show a
          slim rail to reopen it, instead of losing the selection entirely. */}
      {selected && logCollapsed && (
        <button
          type="button"
          onClick={() => setLogCollapsed(false)}
          className="bg-card hover:bg-accent fixed right-0 top-1/2 z-20 -translate-y-1/2 rounded-l-lg border-y border-l py-3 pl-1.5 pr-1 text-muted-foreground shadow-lg"
          title={`Show logs: ${selected.name}`}
          aria-label={`Show logs for ${selected.name}`}
        >
          <PanelLeftOpenIcon className="size-4" />
        </button>
      )}

      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          isError={toast.isError}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
