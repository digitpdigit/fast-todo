import { Show } from "solid-js";
import type { TaskInstance } from "../types";
import { DAY_LABELS, parseYmd } from "../lib/dates";

type Props = {
  open: boolean;
  task: TaskInstance | null;
  onClose: () => void;
  onEditSchedule: () => void;
};

function weekdayShortLabels(nums: number[]): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  return sorted.map((n) => DAY_LABELS[n - 1]?.slice(0, 3) ?? String(n)).join(", ");
}

export default function TaskDetailModal(props: Props) {
  return (
    <Show when={() => props.open && props.task != null}>
      {() => {
        const task = props.task;
        if (task == null) return null;

        return (
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl dark:bg-zinc-900">
              <div class="mb-3 flex items-start justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span
                    class="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15 dark:ring-white/20"
                    style={{ "background-color": task.color ?? "#71717a" }}
                    aria-hidden="true"
                  />
                  <h3 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{task.templateTitle}</h3>
                </div>
                <button
                  type="button"
                  class="shrink-0 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  onClick={() => props.onClose()}
                >
                  Close
                </button>
              </div>
              <Show when={(task.templateDescription ?? "").trim()}>
                <p class="mb-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                  {(task.templateDescription ?? "").trim()}
                </p>
              </Show>
              <dl class="mb-4 space-y-2 text-sm">
                <div class="flex flex-col gap-0.5">
                  <dt class="text-xs font-medium uppercase tracking-wide text-zinc-500">Occurrence</dt>
                  <dd class="text-zinc-800 dark:text-zinc-200">
                    {parseYmd(task.date).toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </dd>
                </div>
                <div class="flex flex-col gap-0.5">
                  <dt class="text-xs font-medium uppercase tracking-wide text-zinc-500">Repeat weekdays</dt>
                  <dd class="text-zinc-800 dark:text-zinc-200">
                    {weekdayShortLabels(task.templateDaysOfWeek ?? [])}
                  </dd>
                </div>
              </dl>
              <div class="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  class="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                  onClick={() => props.onClose()}
                >
                  Close
                </button>
                <button
                  type="button"
                  class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  onClick={() => {
                    props.onEditSchedule();
                    props.onClose();
                  }}
                >
                  Edit schedule
                </button>
              </div>
            </div>
          </div>
        );
      }}
    </Show>
  );
}
