import type { PropertySchema, TaskInstance } from "../types";
import { addDays, formatYmd, weekdayNumFromDate } from "../lib/dates";
import TaskItem from "./TaskItem";
import { For } from "solid-js";

export type CompletionFilter = "all" | "active" | "done";

type Props = {
  weekStart: Date;
  tasks: TaskInstance[];
  schemas: PropertySchema[];
  hiddenSchemaIds: string[];
  completionFilter: CompletionFilter;
  propertyFilters: Record<string, string>;
  onToggle: (id: string) => void;
  onPropertyChange: (id: string, schemaId: string, value: string) => void;
  onNewItem: (weekdayNum: number) => void;
  onEditRule: (templateId: string) => void;
  onRemoveFromDay: (instanceId: string) => void;
  onOpenDetail: (task: TaskInstance) => void;
};

function passesFilters(
  t: TaskInstance,
  completion: CompletionFilter,
  propertyFilters: Record<string, string>,
): boolean {
  if (completion === "active" && t.completed) return false;
  if (completion === "done" && !t.completed) return false;
  for (const [schemaId, val] of Object.entries(propertyFilters)) {
    if (!val) continue;
    if ((t.properties ?? {})[schemaId] !== val) return false;
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
          (t) => t.date === ymd && passesFilters(t, props.completionFilter, props.propertyFilters),
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
                      schemas={props.schemas}
                      hiddenSchemaIds={props.hiddenSchemaIds}
                      onToggle={() => props.onToggle(t.id)}
                      onPropertyChange={(sid, val) => props.onPropertyChange(t.id, sid, val)}
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
