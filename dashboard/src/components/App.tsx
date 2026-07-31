import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/registry/default/ui/button";
import { MoonIcon, PanelLeftOpenIcon, RefreshCwIcon, SunIcon } from "lucide-react";
import { NewProcessDialog } from "./NewProcessDialog";
import { ProcessList } from "./ProcessList";
import { LogPanel } from "./LogPanel";
import { Toast } from "./Toast";
import { listProcesses } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";
import type { ProcessListResponse, ProcessView } from "@/lib/types";

export function App() {
  const [data, setData] = useState<ProcessListResponse | null>(null);
  const [meta, setMeta] = useState("loading…");
  const [auto, setAuto] = useState(false);
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

  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await listProcesses();
      setData(d);
      setMeta(
        `server ${d.serverId}${d.pid ? ` (pid ${d.pid})` : ""} · ${new Date().toLocaleTimeString()}`,
      );
      // Keep the selected log target in sync with the latest process view.
      setSelected((cur) =>
        cur ? d.processes.find((p) => p.id === cur.id) ?? null : null,
      );
    } catch (err) {
      setMeta(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const showToast = useCallback(
    (message: string, isError?: boolean) =>
      setToast({ message, isError, key: Date.now() }),
    [],
  );

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Auto-refresh toggle.
  useEffect(() => {
    if (auto) {
      autoTimer.current = setInterval(() => void refresh(), 3000);
      void refresh();
    }
    return () => {
      if (autoTimer.current) {
        clearInterval(autoTimer.current);
        autoTimer.current = null;
      }
    };
  }, [auto, refresh]);

  const processes = data?.processes ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="bg-card sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight">procm-mcp</h1>
          <p className="text-muted-foreground truncate text-xs">{meta}</p>
        </div>
        <div className="flex items-center gap-2">
          <NewProcessDialog
            onStarted={(id) => {
              showToast(`Started: ${id}`);
              void refresh();
            }}
            onError={(m) => showToast(m, true)}
          />
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCwIcon />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={toggle}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
          <label className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            auto (3s)
          </label>
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
              onChanged={() => void refresh()}
              onToast={showToast}
            />
          </div>
        </main>

        {selected && !logCollapsed && (
          <div className="w-full max-w-[min(640px,46vw)] shrink-0">
            <LogPanel
              process={selected}
              onClose={() => setLogCollapsed(true)}
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
