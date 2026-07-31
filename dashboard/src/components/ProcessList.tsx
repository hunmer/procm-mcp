import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/registry/default/ui/table";
import { Button } from "@/registry/default/ui/button";
import { StatusBadge } from "./StatusBadge";
import { restartProcess, stopProcess } from "@/lib/api";
import type { ProcessView } from "@/lib/types";

interface ProcessListProps {
  processes: ProcessView[];
  selectedId: string | null;
  onSelectLogs: (p: ProcessView) => void;
  onToast: (message: string, isError?: boolean) => void;
}

export function ProcessList({
  processes,
  selectedId,
  onSelectLogs,
  onToast,
}: ProcessListProps) {
  async function handleStop(id: string) {
    if (!window.confirm(`Stop and delete process ${id}?`)) return;
    try {
      await stopProcess(id);
      onToast(`Stopped ${id}`);
      // The backend emits a process-change event once the removal completes,
      // which arrives over WebSocket and refreshes the list automatically.
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function handleRestart(id: string) {
    try {
      await restartProcess(id);
      onToast(`Restarted ${id}`);
      // Same as stop: the WebSocket push handles the list refresh.
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  if (processes.length === 0) {
    return (
      <div className="text-muted-foreground p-6 text-center text-sm">
        No processes.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Command</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>PID</TableHead>
          <TableHead>Exit</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {processes.map((p) => {
          const cmd = `${p.script}${p.args?.length ? " " + p.args.join(" ") : ""}`;
          const isActive = p.id === selectedId;
          return (
            <TableRow
              key={p.id}
              data-state={isActive ? "selected" : undefined}
            >
              <TableCell className="font-mono text-sm">{p.name}</TableCell>
              <TableCell>
                <code className="text-sm">{cmd}</code>
              </TableCell>
              <TableCell>
                <StatusBadge status={p.status} />
              </TableCell>
              <TableCell className="text-sm tabular-nums">
                {p.pid != null ? p.pid : "—"}
              </TableCell>
              <TableCell className="text-sm tabular-nums">
                {p.exitCode != null ? p.exitCode : "—"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    onClick={() => onSelectLogs(p)}
                  >
                    Logs
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestart(p.id)}
                  >
                    Restart
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive-outline"
                    onClick={() => handleStop(p.id)}
                  >
                    Stop
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
