import type { Accessor } from "solid-js";
import { Show } from "solid-js";
import type { TaskInstance } from "../types";

function IconPencil() {
  return (
    <svg
      class="h-4 w-4"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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
    <svg
      class="h-4 w-4"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

export type PopoverTaskRowProps = {
  task: TaskInstance;
  expandedTaskId: Accessor<string | null>;
  editingInstanceId: Accessor<string | null>;
  busyInstanceId: Accessor<string | null>;
  quickBusy: Accessor<boolean>;
  editDraft: Accessor<string>;
  setEditDraft: (v: string) => void;
  onDragStartRow: (e: DragEvent) => void;
  onCycleColor: () => void;
  onToggleComplete: () => void;
  onToggleDescription: () => void;
  onStartEdit: () => void;
  onDeleteSeries: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
};

export default function PopoverTaskRow(props: PopoverTaskRowProps) {
  const tid = () => props.task.id;

  /** Read signals here only — avoids parent `<For>` subscribing every row to every signal. */
  const expanded = () => props.expandedTaskId() === tid();
  const editing = () => props.editingInstanceId() === tid();
  const dragActive = () =>
    !props.quickBusy() &&
    props.busyInstanceId() === null &&
    props.editingInstanceId() === null;
  const rowLocked = () => props.busyInstanceId() !== null;

  const titleClass = () =>
    props.task.completed
      ? "text-sm text-zinc-400 line-through dark:text-zinc-500"
      : "text-sm text-zinc-900 dark:text-zinc-100";

  const descText = () => (props.task.templateDescription ?? "").trim();
  const hasDesc = () => descText().length > 0;

  return (
    <div
      data-task-card=""
      class="mb-2 box-border flex min-h-[58px] gap-2 rounded-md border border-zinc-200 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900 items-center"
    >
      <div
        class={`touch-none select-none self-start py-3 text-base leading-none text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-400 ${
          dragActive()
            ? "cursor-grab active:cursor-grabbing"
            : "invisible pointer-events-none"
        }`}
        draggable={dragActive()}
        aria-hidden={!dragActive()}
        aria-label={dragActive() ? "Drag to reorder" : undefined}
        title={dragActive() ? "Drag to reorder" : undefined}
        data-tauri-drag-region-exclude=""
        onDragStart={props.onDragStartRow}
      >
        ⋮⋮⋮
      </div>
      <button
        type="button"
        class="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15 hover:ring-2 hover:ring-zinc-400 disabled:opacity-50 dark:ring-white/20 dark:hover:ring-zinc-500"
        style={{ "background-color": props.task.color ?? "#71717a" }}
        title="Cycle color"
        aria-label="Cycle task color"
        data-tauri-drag-region-exclude=""
        disabled={rowLocked()}
        onClick={() => props.onCycleColor()}
      />
      <input
        type="checkbox"
        class="mt-1 h-4 w-4 shrink-0"
        data-tauri-drag-region-exclude=""
        disabled={editing() || rowLocked()}
        checked={props.task.completed}
        onChange={() => props.onToggleComplete()}
      />
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <Show
          when={editing()}
          fallback={
            <button
              type="button"
              class={`block w-full min-w-0 cursor-pointer text-left hover:underline ${titleClass()} ${
                expanded() ? "whitespace-normal wrap-break-word" : "truncate"
              }`}
              aria-expanded={expanded()}
              data-tauri-drag-region-exclude=""
              disabled={rowLocked()}
              onClick={() => props.onToggleDescription()}
            >
              {props.task.templateTitle}
            </button>
          }
        >
          <input
            type="text"
            class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-950"
            value={props.editDraft()}
            data-tauri-drag-region-exclude=""
            disabled={rowLocked()}
            onInput={(e) => props.setEditDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") props.onSaveEdit();
              if (e.key === "Escape") props.onCancelEdit();
            }}
          />
        </Show>
        <Show when={!editing() && expanded() && hasDesc()}>
          <p class="whitespace-pre-wrap border-l-2 border-zinc-300 pl-2 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
            {descText()}
          </p>
        </Show>
      </div>
      <div class="flex shrink-0 flex-row items-center gap-0.5 self-start pt-0.5">
        <Show
          when={editing()}
          fallback={
            <>
              <button
                type="button"
                class="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
                title="Edit title"
                data-tauri-drag-region-exclude=""
                disabled={rowLocked()}
                onClick={() => props.onStartEdit()}
              >
                <IconPencil />
              </button>
              <button
                type="button"
                class="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                title="Delete task"
                data-tauri-drag-region-exclude=""
                disabled={rowLocked()}
                onClick={() => props.onDeleteSeries()}
              >
                <IconTrash />
              </button>
            </>
          }
        >
          <button
            type="button"
            class="rounded p-1 text-sm font-semibold text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40"
            title="Save title"
            data-tauri-drag-region-exclude=""
            disabled={rowLocked() || !props.editDraft().trim()}
            onClick={() => props.onSaveEdit()}
          >
            ✓
          </button>
          <button
            type="button"
            class="rounded p-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="Cancel"
            data-tauri-drag-region-exclude=""
            disabled={rowLocked()}
            onClick={() => props.onCancelEdit()}
          >
            ✕
          </button>
        </Show>
      </div>
    </div>
  );
}
