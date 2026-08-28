import { LogPanel } from "../LogPanel";
import { ProcessList } from "../ProcessList";
import type { ProcessView, WsLogClearedMessage, WsLogMessage } from "@/lib/types";

interface ProcessWorkspaceProps {
  processes: ProcessView[];
  // True until the first snapshot lands (see App's initialLoaded).
  loading?: boolean;
  selected: ProcessView | null;
  logCollapsed: boolean;
  unread: Record<string, number>;
  onToggleFavorite: (process: ProcessView) => void;
  onSelectLogs: (process: ProcessView | null) => void;
  onView: (process: ProcessView) => void;
  onToast: (message: string, isError?: boolean) => void;
  onOpenFolder: (path: string) => void;
  onCloseLogs: () => void;
  onLiveLog: (
    callback: (message: WsLogMessage | WsLogClearedMessage) => void,
  ) => void;
}

export function ProcessWorkspace({
  processes,
  loading,
  selected,
  logCollapsed,
  unread,
  onToggleFavorite,
  onSelectLogs,
  onView,
  onToast,
  onOpenFolder,
  onCloseLogs,
  onLiveLog,
}: ProcessWorkspaceProps) {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <ProcessList
          processes={processes}
          loading={loading}
          selectedId={selected?.id ?? null}
          unread={unread}
          onToggleFavorite={onToggleFavorite}
          onSelectLogs={onSelectLogs}
          onView={onView}
          onToast={onToast}
          onOpenFolder={onOpenFolder}
        />
      </div>
      {selected && !logCollapsed && (
        <div className="w-full max-w-[min(640px,46vw)] shrink-0 border-l">
          <LogPanel
            process={selected}
            onClose={onCloseLogs}
            onLiveLog={onLiveLog}
            onToast={onToast}
          />
        </div>
      )}
    </div>
  );
}
