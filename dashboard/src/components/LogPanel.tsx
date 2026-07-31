import { useEffect, useRef, useState } from "react";
import { Button } from "@/registry/default/ui/button";
import { Input } from "@/registry/default/ui/input";
import { ScrollArea } from "@/registry/default/ui/scroll-area";
import { PanelRightCloseIcon } from "lucide-react";
import { getLogs } from "@/lib/api";
import type { UseDashboardSocket } from "@/lib/ws";
import type { ProcessStream, ProcessView, WsLogMessage } from "@/lib/types";

interface LogPanelProps {
  process: ProcessView;
  onClose: () => void;
  // Register a handler for live log lines. Passed down from App so all
  // components share a single WebSocket connection.
  onLogMessage: UseDashboardSocket["onLogMessage"];
}

export function LogPanel({ process, onClose, onLogMessage }: LogPanelProps) {
  const [stream, setStream] = useState<ProcessStream>("stdout");
  const [count, setCount] = useState(200);
  const [text, setText] = useState("Select a stream above.");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const asideRef = useRef<HTMLElement | null>(null);
  const stickToBottom = useRef(true);

  // The real scroll container is the ScrollArea Viewport (Base UI renders it
  // with data-slot="scroll-area-viewport"). Locate it within this panel and
  // track whether the user is parked at the bottom.
  const viewport = () =>
    asideRef.current?.querySelector<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    ) ?? null;

  useEffect(() => {
    const el = viewport();
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Refetch the historical snapshot whenever the process, stream, or count
  // changes. Live appends (below) layer on top of this base.
  useEffect(() => {
    let cancelled = false;
    const id = ++reqId.current;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getLogs(process.id, stream, count);
        if (cancelled || reqId.current !== id) return;
        setText(data.text || "(empty)");
        stickToBottom.current = true;
      } catch (err) {
        if (cancelled || reqId.current !== id) return;
        setError(err instanceof Error ? err.message : String(err));
        setText("error");
      } finally {
        if (!cancelled && reqId.current === id) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [process.id, stream, count]);

  // Subscribe to live log lines for this process/stream and append them.
  // Each connection's callback is stored in a ref by the hook, so registering
  // here on every render is cheap and always points at fresh state.
  const streamRef = useRef(stream);
  streamRef.current = stream;
  onLogMessage((m: WsLogMessage) => {
    if (m.processId !== process.id || m.stream !== streamRef.current) return;
    const line = `[${new Date(m.timestamp).toISOString()}] ${m.message}`;
    setText((cur) => (cur === "(empty)" ? line : cur + "\n" + line));
  });

  // Keep the view pinned to the latest line when new content arrives and the
  // user hasn't scrolled away.
  useEffect(() => {
    if (!stickToBottom.current) return;
    const el = viewport();
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <aside ref={asideRef} className="flex h-full min-w-0 flex-col border-l bg-card">
      <header className="flex flex-col gap-3 border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              Logs: {process.name}
            </h2>
            <p className="text-muted-foreground truncate font-mono text-xs">
              {process.id}
            </p>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Collapse log panel"
            title="Collapse"
            onClick={onClose}
          >
            <PanelRightCloseIcon />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={stream === "stdout" ? "default" : "outline"}
            onClick={() => setStream("stdout")}
          >
            stdout
          </Button>
          <Button
            size="sm"
            variant={stream === "stderr" ? "default" : "outline"}
            onClick={() => setStream("stderr")}
          >
            stderr
          </Button>
          <label className="text-muted-foreground ml-1 inline-flex items-center gap-1.5 text-xs">
            count
            <Input
              type="number"
              value={count}
              min={1}
              onChange={(e) =>
                setCount(Math.max(1, Number(e.target.value) || 0))
              }
              className="h-7 w-20"
            />
          </label>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <pre className="bg-neutral-950 m-0 whitespace-pre-wrap break-words p-4 text-xs leading-relaxed text-neutral-100">
          {loading ? "loading…" : error ? `error: ${error}` : text}
        </pre>
      </ScrollArea>
    </aside>
  );
}
