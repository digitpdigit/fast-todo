import { createSignal, Index, Show } from "solid-js";
import type { NewPropertyOptionInput } from "../types";
import * as api from "../api";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type Row = NewPropertyOptionInput;

export default function PropertyModal(props: Props) {
  const [name, setName] = createSignal("Status");
  const [rows, setRows] = createSignal<Row[]>([
    { value: "todo", label: "To do", color: "#9ca3af" },
    { value: "doing", label: "Doing", color: "#3b82f6" },
    { value: "done", label: "Done", color: "#22c55e" },
  ]);

  const save = async () => {
    const n = name().trim();
    const r = rows().filter((x) => x.value.trim() && x.label.trim());
    if (!n || r.length === 0) return;
    await api.createPropertySchema(n, r);
    props.onSaved();
    props.onClose();
  };

  const updateRow = (i: number, patch: Partial<Row>) => {
    const cur = [...rows()];
    cur[i] = { ...cur[i], ...patch };
    setRows(cur);
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl dark:bg-zinc-900">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">New property</h3>
            <button
              type="button"
              class="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              onClick={() => props.onClose()}
            >
              Close
            </button>
          </div>
          <label class="mb-3 flex flex-col gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Name
            <input
              class="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-950"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </label>
          <div class="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Enum values</div>
          <div class="mb-3 flex flex-col gap-2">
            <Index each={rows()}>
              {(row, i) => (
                <div class="grid grid-cols-6 gap-2">
                  <input
                    class="col-span-2 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                    placeholder="value"
                    value={row().value}
                    onInput={(e) => updateRow(i(), { value: e.currentTarget.value })}
                  />
                  <input
                    class="col-span-2 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                    placeholder="label"
                    value={row().label}
                    onInput={(e) => updateRow(i(), { label: e.currentTarget.value })}
                  />
                  <input
                    type="color"
                    class="col-span-1 h-8 w-full rounded border border-zinc-300 dark:border-zinc-600"
                    value={row().color}
                    onInput={(e) => updateRow(i(), { color: e.currentTarget.value })}
                  />
                  <button
                    type="button"
                    class="col-span-1 rounded border border-zinc-300 text-xs dark:border-zinc-600"
                    onClick={() => {
                      const idx = i();
                      setRows(rows().filter((_, j) => j !== idx));
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </Index>
            <button
              type="button"
              class="self-start rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600"
              onClick={() =>
                setRows([...rows(), { value: "", label: "", color: "#a78bfa" }])
              }
            >
              Add value
            </button>
          </div>
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
