import { useEffect, useRef, useState } from "react";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import {
  EllipsisIcon,
  ExternalLinkIcon,
  GripVerticalIcon,
  PencilIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react";
import { Badge } from "@/registry/default/ui/badge";
import { Button } from "@/registry/default/ui/button";
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/registry/default/ui/context-menu";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@/registry/default/ui/popover";
import type { ProcessView } from "@/lib/types";
import { CreateDropdown } from "../CreateDropdown";
import { ProcessActions } from "./ProcessActions";
import { ProcessContextMenu } from "./ProcessContextMenu";
import { GroupIcon } from "./GroupIcon";
import { STATUS_DOT, type ProcessGroup, type RowActions } from "./types";
import { canStopProcess, UNGROUPED } from "./utils";

// One dense row of the board view: status dot + two-line name/desc + port and
// unread badges, with drag / stop-or-run / a dots overflow popover surfacing
// on hover. Clicking opens the log panel; the shared context menu carries
// every other action.
function BoardRow({
  p,
  isActive,
  unreadCount,
  actions,
  dragGroup,
  dragEnabled = true,
}: {
  p: ProcessView;
  isActive: boolean;
  unreadCount: number;
  actions: RowActions;
  // Group label the row reports to the DnD context (same-group collision only).
  dragGroup?: string;
  dragEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const canStop = canStopProcess(p);
  const port = typeof p.port === "number" ? p.port : null;
  const portHref = port ? `http://localhost:${port}` : null;
  const cmd = `${p.script}${p.args?.length ? " " + p.args.join(" ") : ""}`;
  const subtitle = p.desc || cmd;
  const sortable = useSortable({
    id: p.id,
    data: { type: "process", group: dragGroup },
    disabled: !dragEnabled,
    animateLayoutChanges: () => true,
  });
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        visibility: sortable.isDragging ? "hidden" : "visible",
      }}
      className="group/row"
      data-dragging={sortable.isDragging || undefined}
    >
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className="flex cursor-pointer items-center gap-2 bg-card px-3 py-1 transition-colors hover:bg-accent/60 data-[state=selected]:bg-primary/10 data-[state=selected]:shadow-[inset_2px_0_0_var(--primary)]"
              data-state={isActive ? "selected" : undefined}
              onClick={() => actions.onSelectLogs(p)}
            />
          }
        >
        <span
          className={
            "inline-block size-2 shrink-0 rounded-full " + STATUS_DOT[p.status]
          }
          title={t(`status.${p.status}`)}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-xs font-semibold leading-tight">
            {p.name}
          </span>
          <span
            className="text-muted-foreground block truncate text-[10px] leading-tight"
            title={subtitle}
          >
            {subtitle}
          </span>
        </span>
        {port != null && portHref && (
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
        )}
        {unreadCount > 0 ? (
          <Badge variant="info" className="tabular-nums">
            {unreadCount > 999 ? "999+" : unreadCount}
          </Badge>
        ) : null}
        {/* Hover actions keep their slot so the row doesn't jump. */}
        <div
          className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {dragEnabled && (
            <Button
              ref={sortable.setActivatorNodeRef}
              size="icon-xs"
              variant="ghost"
              aria-label="拖拽排序进程"
              title="拖拽排序进程"
              className="text-muted-foreground cursor-grab"
              {...sortable.attributes}
              {...sortable.listeners}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVerticalIcon />
            </Button>
          )}
          {canStop ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={t("processes.stopAria", { name: p.name })}
              title={t("processes.stopTitle")}
              onClick={() => actions.onRequestStop(p)}
              className="text-muted-foreground hover:text-warning"
            >
              <SquareIcon />
            </Button>
          ) : (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={t("processes.runAria", { name: p.name })}
              title={t("processes.runTitle")}
              onClick={() => actions.onRestart(p.id)}
              className="text-muted-foreground hover:text-success"
            >
              <PlayIcon />
            </Button>
          )}
          {/* Overflow popover: the same action icons as the card footer. */}
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="更多操作"
                  title="更多操作"
                  className="text-muted-foreground hover:text-foreground"
                />
              }
            >
              <EllipsisIcon />
            </PopoverTrigger>
            <PopoverPopup className="min-w-0!">
              <ProcessActions
                process={p}
                favorited={p.favorite === true}
                onToggleFavorite={actions.onToggleFavorite}
                onRestart={actions.onRestart}
                onStop={actions.onRequestStop}
                onDelete={actions.onRequestDelete}
              />
            </PopoverPopup>
          </Popover>
        </div>
      </ContextMenuTrigger>
      <ProcessContextMenu p={p} actions={actions} />
      </ContextMenu>
    </div>
  );
}

// One board column = one group. Unlike the grouped view there is no collapsible
// state: the header only summarizes (folder icon, label, running + total
// counts) with the same "+" create menu and rename pencil as the grouped
// header, revealed on hover.
function BoardColumn({
  g,
  selectedId,
  unread,
  actions,
  onToast,
  groupOptions,
  onRenameGroup,
  dragEnabled = true,
}: {
  g: ProcessGroup;
  selectedId: string | null;
  unread: Record<string, number>;
  actions: RowActions;
  // Toast sink for the column "+" create menu.
  onToast: (message: string, isError?: boolean) => void;
  // Existing group labels offered by the create menu's group combobox.
  groupOptions: string[];
  // Open the rename-group dialog for this column's group.
  onRenameGroup: (g: ProcessGroup) => void;
  dragEnabled?: boolean;
}) {
  const { t } = useTranslation();
  const runningCount = g.processes.filter(canStopProcess).length;
  const sortable = useSortable({
    id: `group:${g.label}`,
    data: { type: "group", label: g.label },
    disabled: !dragEnabled,
  });
  return (
    // One div per column; the card rows are direct children of it (no wrapper
    // layer). overflow-hidden clips the square row backgrounds to the rounded
    // border so the bottom corners aren't painted over.
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className="group/col flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card/40 pb-1.5"
      data-dragging={sortable.isDragging || undefined}
    >
      <div className="mb-1.5 flex items-center gap-2 border-b px-3 py-2">
        <GroupIcon imageIcon={g.imageIcon} className="size-3.5" />
        <span
          className="min-w-0 flex-1 truncate text-xs font-semibold"
          title={g.label === UNGROUPED ? t("processes.ungrouped") : g.label}
        >
          {g.label === UNGROUPED ? t("processes.ungrouped") : g.label}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/col:opacity-100 focus-within:opacity-100">
          {dragEnabled && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="拖拽排序列"
              title="拖拽排序列"
              className="text-muted-foreground cursor-grab"
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <GripVerticalIcon />
            </Button>
          )}
          <CreateDropdown
            trigger={
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
              />
            }
            defaultGroup={g.label === UNGROUPED ? "" : g.label}
            defaultImportGroup={g.label === UNGROUPED ? "" : g.label}
            groupOptions={groupOptions}
            onStarted={(id) => onToast(t("toasts.started", { id }))}
            onCreated={(id) => onToast(t("toasts.created", { id }))}
            onError={(m) => onToast(m, true)}
            onToast={onToast}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("processes.renameGroupAria")}
            title={t("processes.renameGroupAria")}
            onClick={() => onRenameGroup(g)}
            className="text-muted-foreground"
          >
            <PencilIcon />
          </Button>
        </div>
        {runningCount > 0 && (
          <Badge
            variant="success"
            className="tabular-nums"
            title={t("processes.runningCountTitle", { count: runningCount })}
          >
            {runningCount}
          </Badge>
        )}
        <Badge variant="secondary" className="tabular-nums">
          {g.processes.length}
        </Badge>
      </div>
      <SortableContext
        items={g.processes.map((p) => p.id)}
        strategy={verticalListSortingStrategy}
      >
        {g.processes.map((p) => (
          <BoardRow
            key={p.id}
            p={p}
            isActive={p.id === selectedId}
            unreadCount={unread[p.id] ?? 0}
            actions={actions}
            dragGroup={g.label}
            dragEnabled={dragEnabled}
          />
        ))}
      </SortableContext>
    </div>
  );
}

// Column layout is JS-driven, not CSS auto-fill: a ResizeObserver on the
// board wrapper measures the real available width and the column count is
// computed in JS. Each visual column is an independent flex container so a
// short group never inherits the row height of a taller neighbouring group.
const MIN_COLUMN_WIDTH = 240;
const COLUMN_GAP = 12;

// Kanban-style dense alternative to the grouped card view: one column per
// group in a responsive multi-column layout — the column count adapts to the
// measured container width (ResizeObserver, ~240px floor per column) and the
// extra groups wrap onto the row below. Rows are already ordered by the shared
// sort select (pinned first). No collapsing, no drag.
export function ProcessBoard({
  groups,
  selectedId,
  unread,
  actions,
  onToast,
  groupOptions,
  onRenameGroup,
  dragEnabled = true,
}: {
  groups: ProcessGroup[];
  selectedId: string | null;
  unread: Record<string, number>;
  actions: RowActions;
  onToast: (message: string, isError?: boolean) => void;
  groupOptions: string[];
  onRenameGroup: (g: ProcessGroup) => void;
  dragEnabled?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      const count = Math.max(
        1,
        Math.floor((width + COLUMN_GAP) / (MIN_COLUMN_WIDTH + COLUMN_GAP)),
      );
      setColumnCount((prev) => (prev === count ? prev : count));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const columns = Array.from(
    { length: columnCount },
    (): typeof groups => [],
  );
  groups.forEach((group, index) => {
    columns[index % columnCount].push(group);
  });

  return (
    <div ref={wrapRef} className="h-full overflow-x-hidden overflow-y-auto">
      <SortableContext
        items={groups.map((g) => `group:${g.label}`)}
        strategy={rectSortingStrategy}
      >
        <div
          className="grid items-start gap-x-3"
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
        >
          {columns.map((column, columnIndex) => (
            <div
              key={columnIndex}
              className="flex min-w-0 flex-col gap-3"
            >
              {column.map((g) => (
                <BoardColumn
                  key={g.label}
                  g={g}
                  selectedId={selectedId}
                  unread={unread}
                  actions={actions}
                  onToast={onToast}
                  groupOptions={groupOptions}
                  onRenameGroup={onRenameGroup}
                  dragEnabled={dragEnabled}
                />
              ))}
            </div>
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
