import type { TaskInstance } from "../types";
import { addDays, formatYmd, weekdayNumFromDate } from "../lib/dates";
import { normalizeHex } from "../lib/taskColors";
import TaskItem from "./TaskItem";
import { For } from "solid-js";

export type CompletionFilter = "all" | "active" | "done";

type Props = {
  weekStart: Date;
  tasks: TaskInstance[];
  completionFilter: CompletionFilter;
  /** `null` = all; else match task color hex (normalized) */
  colorFilterHex: string | null;
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
  colorFilterHex: string | null,
): boolean {
  if (completion === "active" && t.completed) return false;
  if (completion === "done" && !t.completed) return false;
  if (colorFilterHex !== null && normalizeHex(t.color ?? "") !== normalizeHex(colorFilterHex)) {
    return false;
  }
  return true;
}

export default function WeekView(props: Props) {
  const monday = () => props.weekStart;

  return (
    <div class="flex flex-col gap-6">
      {Array.from({ length: 7 }, (_, i) => i).map((i) => {
        const d = addDays(monday(), i);
        const ymd = formatYmd(d);
        const weekdayNum = weekdayNumFromDate(d);
        const dayTasks = props.tasks.filter(
          (t) => t.date === ymd && passesFilters(t, props.completionFilter, props.colorFilterHex),
        );
        const label = d.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        return (
          <section class="space-y-2">
            <h2 class="border-b border-zinc-200 pb-1 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              {label}
            </h2>
            <div class="flex flex-col gap-2">
              {dayTasks.length === 0 ? (
                <p class="text-sm text-zinc-400">No tasks</p>
              ) : (
                <For each={dayTasks}>
                  {(t) => (
                    <TaskItem
                      task={t}
                      onToggle={() => props.onToggle(t.id)}
                      onCycleColor={props.onCycleTemplateColor}
                      onEditRule={() => props.onEditRule(t.templateId)}
                      onRemoveFromDay={() => void props.onRemoveFromDay(t.id)}
                      onTitleClick={() => props.onOpenDetail(t)}
                    />
                  )}
                </For>
              )}
            </div>
            <button
              type="button"
              class="mt-1 w-full rounded border border-dashed border-zinc-300 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
              onClick={() => props.onNewItem(weekdayNum)}
            >
              + New item
            </button>
          </section>
        );
      })}
    </div>
  );
}
