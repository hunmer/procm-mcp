import { useTranslation } from "react-i18next";
import { LogPanel } from "../LogPanel";
import { ClientCard } from "../process-list/ProcessCard";
import { Skeleton } from "@/registry/default/ui/skeleton";
import type { RoomLogEntry, RoomMember, RoomView } from "@/lib/types";

interface RoomsWorkspaceProps {
  rooms: RoomView[];
  // True until the first rooms fetch settles (App's roomsLoaded) — skeleton
  // sidebar/log area instead of the "no rooms" empty state.
  loading?: boolean;
  selectedRoom: RoomView | null;
  roomLogs: RoomLogEntry[];
  displayedRoomMembers: RoomMember[];
  roomInfoCollapsed: boolean;
  onSelectRoom: (room: RoomView) => void;
  onToggleRoomInfo: () => void;
  onToast: (message: string, isError?: boolean) => void;
}

// First-load placeholders mirroring the final layout: sidebar entries (title /
// id / member-count lines) and terminal log lines on the right.
// p-skeleton-1: https://coss.com/ui/r/p-skeleton-1.json
function RoomListSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="mb-1 w-full px-3 py-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-1 h-3 w-1/2" />
          <Skeleton className="mt-1 h-3 w-1/3" />
        </div>
      ))}
    </>
  );
}

function RoomLogSkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-4">
      {["w-3/4", "w-full", "w-2/3", "w-5/6", "w-1/2", "w-3/4", "w-2/3", "w-1/2"].map(
        (w, i) => (
          <Skeleton key={i} className={`h-4 ${w}`} />
        ),
      )}
    </div>
  );
}

export function RoomsWorkspace({
  rooms,
  loading = false,
  selectedRoom,
  roomLogs,
  displayedRoomMembers,
  roomInfoCollapsed,
  onSelectRoom,
  onToggleRoomInfo,
  onToast,
}: RoomsWorkspaceProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-64 shrink-0 overflow-y-auto border-r p-2">
        {loading ? (
          <RoomListSkeleton />
        ) : rooms.length === 0 ? (
          <div className="text-muted-foreground p-3 text-sm">{t("rooms.empty")}</div>
        ) : rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            onClick={() => onSelectRoom(room)}
            className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${selectedRoom?.id === room.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
          >
            <div className="font-medium">{room.title || room.id}</div>
            <div className="text-muted-foreground truncate text-xs">{room.id}</div>
            <div className="text-muted-foreground mt-1 text-xs">
              {selectedRoom?.id === room.id ? displayedRoomMembers.length : room.members.length} {t("rooms.members")}
            </div>
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1">
        {loading && !selectedRoom ? (
          <RoomLogSkeleton />
        ) : selectedRoom ? (
          <div className="flex min-h-0 min-w-0 flex-1">
            <div className="min-h-0 min-w-0 flex-1">
              <LogPanel
                roomMode
                process={{
                  id: selectedRoom.id,
                  name: selectedRoom.title || selectedRoom.id,
                  script: "",
                  args: [],
                  cwd: "",
                  status: "exited",
                  pid: null,
                  exitCode: null,
                  error: null,
                }}
                entries={roomLogs}
                onClose={onToggleRoomInfo}
                onLiveLog={() => undefined}
                onToast={onToast}
              />
            </div>
            {!roomInfoCollapsed && (
              <div className="w-72 shrink-0 overflow-y-auto border-l px-4 py-3">
                <div className="text-base font-semibold">{selectedRoom.title || selectedRoom.id}</div>
                <div className="text-muted-foreground font-mono text-xs">{selectedRoom.id}</div>
                {selectedRoom.note && <p className="text-muted-foreground mt-1 text-sm">{selectedRoom.note}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <span>{t("rooms.processes")}: {selectedRoom.processIds.length}</span>
                  <span>{t("rooms.members")}: {displayedRoomMembers.length}</span>
                </div>
                <div className="mt-4 text-xs font-semibold uppercase tracking-wide">Clients</div>
                <div className="mt-2">
                  {displayedRoomMembers.length === 0 ? (
                    <div className="text-muted-foreground text-sm">{t("rooms.noClients")}</div>
                  ) : displayedRoomMembers.map((member) => (
                    <ClientCard
                      key={member.memberId}
                      {...member}
                      online={selectedRoom.members.some((active) => active.memberId === member.memberId)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">{t("rooms.select")}</div>
        )}
      </div>
    </div>
  );
}
