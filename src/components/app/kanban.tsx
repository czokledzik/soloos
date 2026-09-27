"use client";

import * as React from "react";
import { useId, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

export type KanbanColumn<K extends string> = {
  key: K;
  header: (ids: number[]) => React.ReactNode;
  className?: string;
};

type Columns<K extends string> = Record<K, number[]>;

const COL_PREFIX = "col:";

/**
 * Generic drag-and-drop board. Items are grouped by `columnOf`, keep the
 * order they're given in, and `onMove` receives the new column + its order.
 */
export function Kanban<K extends string, T extends { id: number }>({
  columns,
  items,
  columnOf,
  renderCard,
  onMove,
}: {
  columns: KanbanColumn<K>[];
  items: T[];
  columnOf: (item: T) => K;
  renderCard: (item: T, opts: { overlay: boolean }) => React.ReactNode;
  onMove: (id: number, column: K, orderedIds: number[]) => void;
}) {
  const group = React.useCallback(
    (list: T[]) => {
      const cols = Object.fromEntries(columns.map((c) => [c.key, [] as number[]])) as Columns<K>;
      for (const item of list) cols[columnOf(item)]?.push(item.id);
      return cols;
    },
    [columns, columnOf],
  );

  const [state, setState] = useState(() => group(items));
  const [prevItems, setPrevItems] = useState(items);
  const [activeId, setActiveId] = useState<number | null>(null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Re-sync with server data after mutations.
  if (items !== prevItems) {
    setPrevItems(items);
    setState(group(items));
  }

  function findColumn(id: UniqueIdentifier): K | null {
    if (typeof id === "string" && id.startsWith(COL_PREFIX)) return id.slice(COL_PREFIX.length) as K;
    for (const [key, ids] of Object.entries(state) as [K, number[]][]) if (ids.includes(id as number)) return key;
    return null;
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findColumn(active.id);
    const to = findColumn(over.id);
    if (!from || !to || from === to) return;
    setState((cols) => {
      const toIds = cols[to];
      const overIndex = toIds.indexOf(over.id as number);
      const index = overIndex >= 0 ? overIndex : toIds.length;
      return {
        ...cols,
        [from]: cols[from].filter((id) => id !== active.id),
        [to]: [...toIds.slice(0, index), active.id as number, ...toIds.slice(index)],
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const col = findColumn(active.id);
    if (!col || col !== findColumn(over.id)) return;
    let ids = state[col];
    const oldIndex = ids.indexOf(active.id as number);
    const newIndex = ids.indexOf(over.id as number);
    if (newIndex >= 0 && oldIndex !== newIndex) ids = arrayMove(ids, oldIndex, newIndex);
    setState((c) => ({ ...c, [col]: ids }));
    const original = byId.get(active.id as number);
    if (original && columnOf(original) === col && oldIndex === newIndex) return;
    onMove(active.id as number, col, ids);
  }

  const active = activeId != null ? byId.get(activeId) : undefined;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e) => setActiveId(e.active.id as number)}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setState(group(items));
      }}
    >
      <div className="flex min-h-0 gap-3 overflow-x-auto px-6 pb-6">
        {columns.map((c) => (
          <Column key={c.key} column={c} ids={state[c.key]}>
            {state[c.key].map((id) => {
              const item = byId.get(id);
              return item ? (
                <SortableItem key={id} id={id}>
                  {renderCard(item, { overlay: false })}
                </SortableItem>
              ) : null;
            })}
          </Column>
        ))}
      </div>
      <DragOverlay>{active && renderCard(active, { overlay: true })}</DragOverlay>
    </DndContext>
  );
}

function Column<K extends string>({
  column,
  ids,
  children,
}: {
  column: KanbanColumn<K>;
  ids: number[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: COL_PREFIX + column.key });
  return (
    <div className={cn("flex w-72 shrink-0 flex-col", column.className)}>
      <div className="mb-2 flex items-center gap-2 px-1 text-sm">{column.header(ids)}</div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-24 flex-1 flex-col gap-2 rounded-xl bg-muted/40 p-2 transition-colors",
            isOver && "bg-muted",
          )}
        >
          {children}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableItem({ id, children }: { id: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}
