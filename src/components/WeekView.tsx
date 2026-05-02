import type { TaskInstance } from "../types";
import { addDays, formatYmd, weekdayNumFromDate } from "../lib/dates";
import {
  dataTransferHasTaskPayload,
  TASK_FROM_DATE_MIME,
  TASK_INSTANCE_MIME,
} from "../lib/dragIds";
import { normalizeHex } from "../lib/taskColors";
import TaskItem from "./TaskItem";
import { For } from "solid-js";
import * as api from "../api";
import { dropSlotFromPointer, reorderDraggableIds } from "../lib/taskDnD";

export type CompletionFilter = "all" | "active" | "done";

const DAY_OFFSETS: number[] = [0, 1, 2, 3, 4, 5, 6];

type Props = {
  weekStart: Date;
  tasks: TaskInstance[];
  completionFilter: CompletionFilter;
  /** `null` = all; else match task color hex (normalized) */
  colorFilterHex: string | null;
  /** When false, filtering is active — drag is disabled */
  dragEnabled?: boolean;
  /** After successful reorder/move (mutates server) */
  onAfterTaskDrag?: () => void | Promise<void>;
  onToggle: (id: string) => void;
  onCycleTemplateColor?: (templateId: string) => void | Promise<void>;
  onNewItem: (weekdayNum: number) => void;
  onEditRule: (templateId: string) => void;
  onRemoveFromDay: (instanceId: string) => void;
  onOpenDetail: (task: TaskInstance) => void;
};

function passesFilters(
  t: TaskInstance,
  completion: CompletionFilter,
  colorFilterHex: string | null
): boolean {
  if (completion === "active" && t.completed) return false;
  if (completion === "done" && !t.completed) return false;
  if (
    colorFilterHex !== null &&
    normalizeHex(t.color ?? "") !== normalizeHex(colorFilterHex)
  ) {
    return false;
  }
  return true;
}

type DayColumnProps = {
  weekStart: Date;
  dayOffset: number;
  tasks: TaskInstance[];
  completionFilter: CompletionFilter;
  colorFilterHex: string | null;
  dragEnabled: boolean;
  listRoots: Partial<Record<string, HTMLDivElement>>;
  onDragStart: (t: TaskInstance) => (e: DragEvent) => void;
  onDragOverDay: (ymd: string) => (e: DragEvent) => void;
  onDropDay: (ymd: string) => (e: DragEvent) => Promise<void>;
  onToggle: (id: string) => void;
  onCycleTemplateColor?: (templateId: string) => void | Promise<void>;
  onNewItem: (weekdayNum: number) => void;
  onEditRule: (templateId: string) => void;
  onRemoveFromDay: (instanceId: string) => void;
  onOpenDetail: (task: TaskInstance) => void;
};

function DayColumn(props: DayColumnProps) {
  const d = () => addDays(props.weekStart, props.dayOffset);
  const ymd = () => formatYmd(d());
  const weekdayNum = () => weekdayNumFromDate(d());
  const label = () =>
    d().toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

  const dayTasks = () => {
    const y = ymd();
    return props.tasks
      .filter((t) => t.date === y)
      .filter((t) =>
        passesFilters(t, props.completionFilter, props.colorFilterHex)
      );
  };

  const dnd = () => props.dragEnabled;

  return (
    <section class="space-y-2">
      <h2 class="border-b border-zinc-200 pb-1 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        {label()}
      </h2>
      <div
        class="flex min-h-10 flex-col gap-2"
        data-task-droplist=""
        ref={(el) => {
          const key = ymd();
          if (el) props.listRoots[key] = el;
          else delete props.listRoots[key];
        }}
        onDragOver={dnd() ? props.onDragOverDay(ymd()) : undefined}
        onDrop={dnd() ? (ev) => void props.onDropDay(ymd())(ev) : undefined}
      >
        {dayTasks().length === 0 ? (
          <p class="text-sm text-zinc-400">No tasks</p>
        ) : (
          <For each={dayTasks()}>
            {(t) => (
              <div
                data-task-card=""
                class="box-border flex min-h-[58px] gap-2 rounded-md px-px"
              >
                {/* {dnd() ? (
                  <div
                    class="touch-none cursor-grab select-none self-start py-3 text-base leading-none text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-400 active:cursor-grabbing"
                    draggable
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                    data-tauri-drag-region-exclude=""
                    onDragStart={props.onDragStart(t)}
                  >
                    ⋮⋮⋮
                  </div>
                ) : null} */}
                <div class="min-w-0 flex-1">
                  <TaskItem
                    task={t}
                    onToggle={() => props.onToggle(t.id)}
                    onCycleColor={props.onCycleTemplateColor}
                    onEditRule={() => props.onEditRule(t.templateId)}
                    onRemoveFromDay={() => void props.onRemoveFromDay(t.id)}
                    onTitleClick={() => props.onOpenDetail(t)}
                  />
                </div>
              </div>
            )}
          </For>
        )}
      </div>
      <button
        type="button"
        class="mt-1 w-full rounded border border-dashed border-zinc-300 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
        onClick={() => props.onNewItem(weekdayNum())}
      >
        + New item
      </button>
    </section>
  );
}

export default function WeekView(props: Props) {
  /** Per-day scroll list root for hit-testing drop index */
  const listRoots: Partial<Record<string, HTMLDivElement>> = {};

  const onDragStart = (t: TaskInstance) => (e: DragEvent) => {
    if (!props.dragEnabled) return;
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.setData(TASK_INSTANCE_MIME, t.id);
    dt.setData(TASK_FROM_DATE_MIME, t.date);
    dt.effectAllowed = "move";
  };

  const onDragOverDay = (_ymd: string) => (e: DragEvent) => {
    if (!props.dragEnabled) return;
    if (!dataTransferHasTaskPayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
  };

  const onDropDay =
    (ymd: string) =>
    async (e: DragEvent): Promise<void> => {
      if (!props.dragEnabled) return;
      if (!dataTransferHasTaskPayload(e.dataTransfer)) return;
      e.preventDefault();
      const id = e.dataTransfer?.getData(TASK_INSTANCE_MIME) ?? "";
      const fromDate = e.dataTransfer?.getData(TASK_FROM_DATE_MIME) ?? "";
      if (!id || !fromDate) return;

      const notifyAfterDrag = props.onAfterTaskDrag;

      const dayIdsSorted = props.tasks
        .filter((x) => x.date === ymd)
        .map((x) => x.id);
      const fromIdsSorted = props.tasks
        .filter((x) => x.date === fromDate)
        .map((x) => x.id);
      const fromIdx = fromIdsSorted.indexOf(id);
      if (fromIdx < 0) return;

      const listEl = listRoots[ymd];
      let rawIdx = dropSlotFromPointer(e.clientY, listEl);
      rawIdx = Math.max(0, Math.min(rawIdx, dayIdsSorted.length));

      try {
        if (fromDate === ymd) {
          const next = reorderDraggableIds(fromIdsSorted, fromIdx, rawIdx);
          const sameOrder = next.every((nid, i) => nid === fromIdsSorted[i]);
          if (!sameOrder) await api.reorderTaskInstances(ymd, next);
        } else {
          const insertAt = Math.max(0, Math.min(rawIdx, dayIdsSorted.length));
          await api.moveTaskInstance(id, ymd, insertAt);
        }
        if (notifyAfterDrag) {
          await notifyAfterDrag();
        }
      } catch (err) {
        console.error("task drag drop", err);
      }
    };

  const dragEnabled = () => !!props.dragEnabled;

  return (
    <div class="flex flex-col gap-6">
      <For each={DAY_OFFSETS}>
        {(dayOffset) => (
          <DayColumn
            weekStart={props.weekStart}
            dayOffset={dayOffset}
            tasks={props.tasks}
            completionFilter={props.completionFilter}
            colorFilterHex={props.colorFilterHex}
            dragEnabled={dragEnabled()}
            listRoots={listRoots}
            onDragStart={onDragStart}
            onDragOverDay={onDragOverDay}
            onDropDay={onDropDay}
            onToggle={props.onToggle}
            onCycleTemplateColor={props.onCycleTemplateColor}
            onNewItem={props.onNewItem}
            onEditRule={props.onEditRule}
            onRemoveFromDay={props.onRemoveFromDay}
            onOpenDetail={props.onOpenDetail}
          />
        )}
      </For>
    </div>
  );
}
