import { createEffect, createSignal, For, on, Show } from "solid-js";
import type { PropertySchema, TaskRule } from "../types";
import { DAY_LABELS } from "../lib/dates";

type Props = {
  open: boolean;
  schemas: PropertySchema[];
  editing: TaskRule | null;
  /** Monday YYYY-MM-DD for new tasks (creation week anchor) */
  weekAnchorMonday: string;
  /** When creating, pre-fill weekday selection (e.g. day you clicked). Empty = Mon–Fri default */
  initialWeekdays: number[];
  onClose: () => void;
  onSaved: () => void;
  onCreate: (
    title: string,
    days: number[],
    defaultProperties: Record<string, string>,
    description: string,
    anchorWeekStart: string,
  ) => Promise<void>;
  onUpdate: (
    id: string,
    title: string,
    days: number[],
    defaultProperties: Record<string, string>,
    description: string,
    anchorWeekStart: string,
  ) => Promise<void>;
  /** Delete template and all instances (edit mode only). */
  onDeleteSeries?: (templateId: string) => Promise<void>;
};

export default function TaskRuleModal(props: Props) {
  const [title, setTitle] = createSignal("");
  const [days, setDays] = createSignal<number[]>([1, 2, 3, 4, 5]);
  const [defaultProps, setDefaultProps] = createSignal<Record<string, string>>({});
  const [description, setDescription] = createSignal("");
  const [saveError, setSaveError] = createSignal("");

  // Only reset form when opening or switching create/edit target — not on unrelated parent re-renders
  createEffect(
    on(
      () =>
        [
          props.open,
          props.editing?.id ?? "",
          props.initialWeekdays.length
            ? [...props.initialWeekdays].sort((a, b) => a - b).join(",")
            : "",
          props.weekAnchorMonday,
        ] as const,
      ([open]) => {
        if (!open) return;
        setSaveError("");
        const e = props.editing;
        if (e) {
          setTitle(e.title);
          setDays([...(e.daysOfWeek ?? [])].sort((a, b) => a - b));
          setDefaultProps({ ...(e.defaultProperties ?? {}) });
          setDescription(e.description ?? "");
        } else {
          setTitle("");
          const init = props.initialWeekdays.length
            ? [...new Set(props.initialWeekdays)].sort((a, b) => a - b)
            : [1, 2, 3, 4, 5];
          setDays(init);
          setDefaultProps({});
          setDescription("");
        }
      },
    ),
  );

  const toggleDay = (n: number) => {
    const cur = days();
    if (cur.includes(n)) setDays(cur.filter((d) => d !== n));
    else setDays([...cur, n].sort((a, b) => a - b));
  };

  const setDefaultForSchema = (schemaId: string, value: string) => {
    setDefaultProps((prev) => {
      const next = { ...prev };
      if (!value) delete next[schemaId];
      else next[schemaId] = value;
      return next;
    });
  };

  const save = async () => {
    setSaveError("");
    try {
      const t = title().trim();
      if (!t) {
        setSaveError("Add a title.");
        return;
      }
      if (days().length === 0) {
        setSaveError("Pick at least one weekday.");
        return;
      }
      // Plain objects/arrays for Tauri IPC (avoid Solid proxies)
      const dp = { ...defaultProps() };
      const descTrim = description().trim();
      const d = [...days()];
      if (props.editing) {
        await props.onUpdate(
          props.editing.id,
          t,
          d,
          dp,
          descTrim,
          props.editing.anchorWeekStart ?? "",
        );
      } else {
        await props.onCreate(t, d, dp, descTrim, props.weekAnchorMonday ?? "");
      }
      props.onSaved();
      props.onClose();
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const deleteSeries = async () => {
    const e = props.editing;
    if (!e || !props.onDeleteSeries) return;
    if (
      !confirm(
        "Delete this task and all scheduled occurrences? This cannot be undone.",
      )
    ) {
      return;
    }
    setSaveError("");
    try {
      await props.onDeleteSeries(e.id);
      props.onSaved();
      props.onClose();
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl dark:bg-zinc-900">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {props.editing ? "Edit task" : "New task"}
            </h3>
            <button
              type="button"
              class="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              onClick={() => props.onClose()}
            >
              Close
            </button>
          </div>
          <p class="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Weekdays apply only to the week shown in the header when you save. Tasks do not auto-copy to the next week —
            navigate to another week and add again if needed.
          </p>
          {saveError() && (
            <p class="mb-3 rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {saveError()}
            </p>
          )}
          <label class="mb-3 flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Title
            <input
              class="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-950"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              placeholder="e.g. Gym"
            />
          </label>
          <label class="mb-3 flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Description <span class="font-normal text-zinc-500">(optional)</span>
            <textarea
              class="min-h-16 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-950"
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              placeholder="Notes, links, checklist…"
            />
          </label>
          <div class="mb-3">
            <div class="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">Repeat on</div>
            <div class="flex flex-wrap gap-2">
              <For each={DAY_LABELS}>
                {(label, i) => {
                  const n = i() + 1;
                  return (
                    <button
                      type="button"
                      class={`rounded-full px-2 py-1 text-xs font-medium ring-1 ${
                        days().includes(n)
                          ? "bg-blue-600 text-white ring-blue-700"
                          : "bg-zinc-100 text-zinc-600 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                      onClick={() => toggleDay(n)}
                    >
                      {label.slice(0, 3)}
                    </button>
                  );
                }}
              </For>
            </div>
          </div>
          <div class="mb-4">
            <div class="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Default property values (optional)
            </div>
            <div class="flex max-h-48 flex-col gap-2 overflow-y-auto">
              <For each={props.schemas}>
                {(s) => (
                  <label class="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {s.name}
                    <select
                      class="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                      value={defaultProps()[s.id] ?? ""}
                      onChange={(e) => setDefaultForSchema(s.id, e.currentTarget.value)}
                    >
                      <option value="">—</option>
                      <For each={s.options}>
                        {(o) => <option value={o.value}>{o.label}</option>}
                      </For>
                    </select>
                  </label>
                )}
              </For>
            </div>
          </div>
          <Show when={props.editing && props.onDeleteSeries}>
            <div class="mb-4">
              <button
                type="button"
                class="text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                onClick={() => void deleteSeries()}
              >
                Delete task…
              </button>
            </div>
          </Show>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              onClick={() => props.onClose()}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              onClick={() => void save()}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
