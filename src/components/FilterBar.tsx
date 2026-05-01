import { For } from "solid-js";
import type { PropertySchema } from "../types";
import type { CompletionFilter } from "./WeekView";

type Props = {
  schemas: PropertySchema[];
  completionFilter: CompletionFilter;
  onCompletionChange: (v: CompletionFilter) => void;
  propertyFilters: Record<string, string>;
  onPropertyFilterChange: (schemaId: string, value: string) => void;
  /** Hidden property columns */
  hiddenSchemaIds: string[];
  onHiddenSchemaIdsChange: (ids: string[]) => void;
};

export default function FilterBar(props: Props) {
  const hiddenSet = () => new Set(props.hiddenSchemaIds);

  const schemaChecked = (id: string) => !hiddenSet().has(id);

  const toggleSchemaColumn = (schemaId: string, checked: boolean) => {
    const next = new Set(hiddenSet());
    if (checked) next.delete(schemaId);
    else next.add(schemaId);
    props.onHiddenSchemaIdsChange([...next]);
  };

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
        {props.schemas.map((s) => (
          <label class="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {s.name}
            <select
              class="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              value={props.propertyFilters[s.id] ?? ""}
              onChange={(e) => props.onPropertyFilterChange(s.id, e.currentTarget.value)}
            >
              <option value="">Any</option>
              {s.options.map((o) => (
                <option value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div class="border-t border-zinc-200 pt-2 dark:border-zinc-700">
        <div class="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Show property columns</div>
        <div class="flex flex-wrap gap-3">
          <For each={props.schemas}>
            {(s) => (
              <label class="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={schemaChecked(s.id)}
                  onChange={(e) => toggleSchemaColumn(s.id, e.currentTarget.checked)}
                />
                {s.name}
              </label>
            )}
          </For>
          {props.schemas.length === 0 && (
            <span class="text-xs text-zinc-400">Define properties under + Property</span>
          )}
        </div>

        {props.hiddenSchemaIds.length > 0 && (
          <button
            type="button"
            class="mt-2 text-xs text-blue-600 hover:underline"
            onClick={() => props.onHiddenSchemaIdsChange([])}
          >
            Show all columns
          </button>
        )}
      </div>
    </div>
  );
}
