import type { CompletionFilter } from "./WeekView";
import { PRESET_COLORS } from "../lib/taskColors";

type Props = {
  completionFilter: CompletionFilter;
  onCompletionChange: (v: CompletionFilter) => void;
  /** `null` = any color; else exact preset hex to match */
  colorFilterHex: string | null;
  onColorFilterChange: (hex: string | null) => void;
};

export default function FilterBar(props: Props) {
  return (
    <div class="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div class="flex flex-wrap items-end gap-3">
        <label class="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Completion
          <select
            class="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={props.completionFilter}
            onChange={(e) => props.onCompletionChange(e.currentTarget.value as CompletionFilter)}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="done">Done</option>
          </select>
        </label>
        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-zinc-600 dark:text-zinc-400">Color</span>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class={`rounded border px-2 py-1 text-xs ${
                props.colorFilterHex === null
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900"
              }`}
              onClick={() => props.onColorFilterChange(null)}
            >
              All
            </button>
            {PRESET_COLORS.map((p) => {
              const active = props.colorFilterHex === p.hex;
              return (
                <button
                  type="button"
                  title={p.label}
                  class={`h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-zinc-900 ${
                    active ? "ring-zinc-900 dark:ring-zinc-100" : "ring-transparent hover:ring-zinc-400"
                  }`}
                  style={{ "background-color": p.hex }}
                  aria-label={`Filter ${p.label}`}
                  onClick={() => props.onColorFilterChange(active ? null : p.hex)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
