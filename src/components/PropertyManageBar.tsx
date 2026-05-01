import { createSignal, For, Show } from "solid-js";
import type { PropertySchema } from "../types";
import * as api from "../api";

type Props = {
  schemas: PropertySchema[];
  onDeleted: () => void;
};

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

export default function PropertyManageBar(props: Props) {
  const [pending, setPending] = createSignal<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = createSignal(false);

  const runDelete = async (id: string) => {
    setBusy(true);
    try {
      await api.deletePropertySchema(id);
      setPending(null);
      props.onDeleted();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="relative mb-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div class="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Property columns</div>
      <Show
        when={props.schemas.length > 0}
        fallback={<p class="text-sm text-zinc-500">No properties yet. Use + Property to add one.</p>}
      >
        <ul class="divide-y divide-zinc-100 dark:divide-zinc-800">
          <For each={props.schemas}>
            {(s) => (
              <li class="flex items-center justify-between gap-2 py-2 text-sm">
                <span class="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-200">{s.name}</span>
                <button
                  type="button"
                  class="shrink-0 rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                  title={`Delete ${s.name}`}
                  aria-label={`Delete property ${s.name}`}
                  disabled={busy()}
                  onClick={() => setPending({ id: s.id, name: s.name })}
                >
                  <IconTrash />
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      {(() => {
        const row = pending();
        if (!row) return null;
        return (
          <div class="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
            <div class="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
              <p class="mb-3 text-sm text-zinc-800 dark:text-zinc-200">
                Delete property <span class="font-semibold">{row.name}</span>? Values are removed from all tasks and
                templates.
              </p>
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                  disabled={busy()}
                  onClick={() => setPending(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  disabled={busy()}
                  onClick={() => void runDelete(row.id)}
                >
                  {busy() ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
