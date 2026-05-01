import { For, Show } from "solid-js";
import type { PropertySchema, TaskInstance } from "../types";

function schemasToShow(schemas: PropertySchema[], hiddenSchemaIds: string[]): PropertySchema[] {
  if (!hiddenSchemaIds.length) return schemas;
  const hidden = new Set(hiddenSchemaIds);
  return schemas.filter((s) => !hidden.has(s.id));
}

function IconPencil() {
  return (
    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

type Props = {
  task: TaskInstance;
  schemas: PropertySchema[];
  /** Hidden property columns (empty = show all) */
  hiddenSchemaIds: string[];
  onToggle: () => void;
  onPropertyChange: (schemaId: string, value: string) => void;
  onEditRule?: () => void;
  /** Remove this day’s occurrence only (series continues on other days / weeks). */
  onRemoveFromDay?: () => void;
  onTitleClick?: () => void;
};

export default function TaskItem(props: Props) {
  const show = () => schemasToShow(props.schemas, props.hiddenSchemaIds);

  return (
    <div class="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
      <div class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={props.task.completed}
          onChange={() => props.onToggle()}
          class="h-4 w-4 shrink-0"
          aria-label={`Complete ${props.task.templateTitle}`}
        />
        <button
          type="button"
          class={`min-w-0 flex-1 truncate text-left text-sm ${
            props.task.completed ? "text-zinc-400 line-through" : "text-zinc-900 dark:text-zinc-100"
          }`}
          onClick={() => props.onTitleClick?.()}
        >
          {props.task.templateTitle}
        </button>
        {(props.onEditRule || props.onRemoveFromDay) && (
          <div class="flex shrink-0 items-center gap-0.5">
            {props.onEditRule && (
              <button
                type="button"
                class="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
                title="Edit schedule"
                aria-label="Edit schedule"
                onClick={() => props.onEditRule?.()}
              >
                <IconPencil />
              </button>
            )}
            {props.onRemoveFromDay && (
              <button
                type="button"
                class="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                title="Remove from this day"
                aria-label="Remove from this day"
                onClick={() => props.onRemoveFromDay?.()}
              >
                <IconTrash />
              </button>
            )}
          </div>
        )}
      </div>
      <Show when={show().length > 0}>
        <div class="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <For each={show()}>
            {(s) => {
              const currentVal = () => (props.task.properties ?? {})[s.id] ?? "";
              const selectedOpt = () => s.options.find((o) => o.value === currentVal());
              return (
                <select
                  title={`${s.name}${selectedOpt() ? `: ${selectedOpt()!.label}` : ""}`}
                  class="max-w-[12rem] cursor-pointer rounded-full border-0 py-1 pl-2.5 pr-8 text-xs font-medium text-white shadow-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 [&>option]:bg-zinc-800 [&>option]:text-zinc-100"
                  style={{
                    "background-color": selectedOpt()?.color ?? "#71717a",
                    color: "#fff",
                  }}
                  value={currentVal()}
                  onChange={(e) => props.onPropertyChange(s.id, e.currentTarget.value)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">—</option>
                  <For each={s.options}>
                    {(o) => <option value={o.value}>{o.label}</option>}
                  </For>
                </select>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
