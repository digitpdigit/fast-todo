import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { emit, listen } from "@tauri-apps/api/event";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import * as api from "../api";
import { applyDomTheme, bindSystemColorSchemeListener, parseThemeMode } from "../lib/theme";
import type { TaskInstance, ThemeMode } from "../types";
import { formatYmd, startOfWeekMonday, weekdayNumFromDate } from "../lib/dates";
import { DEFAULT_TASK_HEX, nextPresetHex, normalizeHex } from "../lib/taskColors";

const MARGIN_PX = 16;

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

async function positionBottomRightWorkArea() {
  try {
    if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ == null) return;
    const win = getCurrentWindow();
    const mon = await primaryMonitor();
    if (!mon) return;
    const outer = await win.outerSize();
    const { position: wp, size: ws } = mon.workArea;
    const x = wp.x + ws.width - outer.width - MARGIN_PX;
    const y = wp.y + ws.height - outer.height - MARGIN_PX;
    await win.setPosition(new PhysicalPosition(x, y));
  } catch (e) {
    console.error("positionBottomRightWorkArea", e);
  }
}

async function hideWindow() {
  try {
    await getCurrentWindow().hide();
  } catch (e) {
    console.error(e);
  }
}

async function emitTodayRefresh() {
  try {
    await emit("today-refresh", {});
  } catch (err) {
    console.warn("today-refresh emit", err);
  }
}

export default function TodayPopover() {
  const [tasks, setTasks] = createSignal<TaskInstance[]>([]);
  const [expandedTaskId, setExpandedTaskId] = createSignal<string | null>(null);
  const [quickTitle, setQuickTitle] = createSignal("");
  const [quickBusy, setQuickBusy] = createSignal(false);
  const [quickErr, setQuickErr] = createSignal("");
  const [previewColor, setPreviewColor] = createSignal(DEFAULT_TASK_HEX);
  const [editingInstanceId, setEditingInstanceId] = createSignal<string | null>(null);
  const [editDraft, setEditDraft] = createSignal("");
  const [rowBusy, setRowBusy] = createSignal(false);

  const todayLabel = () =>
    new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  const load = async () => {
    const d = formatYmd(new Date());
    const ta = await api.getTasksForDate(d);
    setTasks(ta);
  };

  const submitQuickAdd = async () => {
    const title = quickTitle().trim();
    if (!title || quickBusy()) return;
    setQuickErr("");
    setQuickBusy(true);
    try {
      const now = new Date();
      const anchorMonday = formatYmd(startOfWeekMonday(now));
      const dow = weekdayNumFromDate(now);
      const col = normalizeHex(previewColor());
      await api.createTask(title, [dow], col, "", anchorMonday);
      void api.setPreferredTaskColor(col).catch(() => undefined);
      setQuickTitle("");
      await load();
      await emitTodayRefresh();
    } catch (e) {
      setQuickErr(e instanceof Error ? e.message : String(e));
    } finally {
      setQuickBusy(false);
    }
  };

  const startEdit = (t: TaskInstance) => {
    setEditingInstanceId(t.id);
    setEditDraft(t.templateTitle);
    setExpandedTaskId(null);
  };

  const cancelEdit = () => {
    setEditingInstanceId(null);
    setEditDraft("");
  };

  const saveEdit = async () => {
    const iid = editingInstanceId();
    if (!iid || rowBusy()) return;
    const t = tasks().find((x) => x.id === iid);
    if (!t) return;
    const nt = editDraft().trim();
    if (!nt) return;
    setRowBusy(true);
    try {
      await api.updateTaskTitle(t.templateId, nt);
      cancelEdit();
      await load();
      await emitTodayRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setRowBusy(false);
    }
  };

  const deleteSeries = async (t: TaskInstance) => {
    if (rowBusy()) return;
    setRowBusy(true);
    try {
      if (editingInstanceId() === t.id) cancelEdit();
      await api.deleteTask(t.templateId);
      await load();
      await emitTodayRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setRowBusy(false);
    }
  };

  const toggleDescription = (id: string) => {
    setExpandedTaskId((prev) => (prev === id ? null : id));
  };

  onMount(() => {
    void positionBottomRightWorkArea();
    void load();
    void api.getPreferredTaskColor().then((c) => setPreviewColor(normalizeHex(c)));

    const unbindMql = bindSystemColorSchemeListener();
    void api.getThemeMode().then((raw) => applyDomTheme(parseThemeMode(raw)));

    let unlistenRefresh: (() => void) | undefined;
    let unlistenTheme: (() => void) | undefined;
    void listen("today-refresh", () => void load()).then((u) => {
      unlistenRefresh = u;
    });
    void listen<{ mode: ThemeMode }>("theme-changed", (event) => {
      applyDomTheme(parseThemeMode(event.payload.mode));
    }).then((u) => {
      unlistenTheme = u;
    });
    onCleanup(() => {
      unbindMql();
      unlistenRefresh?.();
      unlistenTheme?.();
    });
  });

  return (
    <div class="box-border flex min-h-screen flex-col overflow-hidden rounded-xl bg-zinc-100 text-zinc-900 ring-1 ring-zinc-300 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700/80">
      <header class="flex shrink-0 items-stretch gap-1 border-b border-zinc-200 bg-white/90 pr-1 dark:border-zinc-800 dark:bg-zinc-900/90">
        <div
          class="flex min-w-0 flex-1 cursor-default select-none items-center px-3 py-2.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
          data-tauri-drag-region
        >
          Today — {todayLabel()}
        </div>
        <button
          type="button"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          title="Close"
          aria-label="Close"
          data-tauri-drag-region-exclude
          onClick={() => void hideWindow()}
        >
          <span class="text-lg leading-none">×</span>
        </button>
      </header>
      <div class="flex min-h-0 flex-1 flex-col p-3">
        <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          <For each={tasks()}>
            {(t) => {
              const descText = (t.templateDescription ?? "").trim();
              const hasDesc = descText.length > 0;
              const expanded = () => expandedTaskId() === t.id;
              const editing = () => editingInstanceId() === t.id;
              const titleClass = () =>
                `text-sm ${
                  t.completed ? "text-zinc-400 line-through dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-100"
                }`;
              return (
                <div class="flex gap-2 rounded-md border border-zinc-200 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  <span
                    class="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15 dark:ring-white/20"
                    style={{ "background-color": t.color ?? "#71717a" }}
                    aria-hidden="true"
                  />
                  <input
                    type="checkbox"
                    class="mt-1 h-4 w-4 shrink-0"
                    data-tauri-drag-region-exclude
                    disabled={editing() || rowBusy()}
                    checked={t.completed}
                    onChange={async () => {
                      const u = await api.toggleTaskComplete(t.id);
                      setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
                    }}
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
                          data-tauri-drag-region-exclude
                          disabled={rowBusy()}
                          onClick={() => toggleDescription(t.id)}
                        >
                          {t.templateTitle}
                        </button>
                      }
                    >
                      <input
                        type="text"
                        class="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                        value={editDraft()}
                        data-tauri-drag-region-exclude
                        disabled={rowBusy()}
                        onInput={(e) => setEditDraft(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    </Show>
                    <Show when={!editing() && expanded() && hasDesc}>
                      <p class="whitespace-pre-wrap border-l-2 border-zinc-300 pl-2 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
                        {descText}
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
                            data-tauri-drag-region-exclude
                            disabled={rowBusy()}
                            onClick={() => startEdit(t)}
                          >
                            <IconPencil />
                          </button>
                          <button
                            type="button"
                            class="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                            title="Delete task"
                            data-tauri-drag-region-exclude
                            disabled={rowBusy()}
                            onClick={() => void deleteSeries(t)}
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
                        data-tauri-drag-region-exclude
                        disabled={rowBusy() || !editDraft().trim()}
                        onClick={() => void saveEdit()}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        class="rounded p-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        title="Cancel"
                        data-tauri-drag-region-exclude
                        disabled={rowBusy()}
                        onClick={() => cancelEdit()}
                      >
                        ✕
                      </button>
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>
          {tasks().length === 0 && (
            <p class="py-2 text-center text-sm text-zinc-500 dark:text-zinc-500">Nothing scheduled today</p>
          )}
        </div>

        <div class="mt-3 shrink-0 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div class="flex gap-2 rounded-md border border-zinc-200 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              class="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15 ring-offset-1 ring-offset-white dark:ring-white/20 dark:ring-offset-zinc-900"
              style={{ "background-color": previewColor() }}
              title="Next color (new tasks)"
              aria-label="Cycle color for new task"
              data-tauri-drag-region-exclude
              disabled={quickBusy()}
              onClick={() => setPreviewColor(nextPresetHex(previewColor()))}
            />
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <input
                type="text"
                class="w-full min-w-0 rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                placeholder="New task…"
                value={quickTitle()}
                disabled={quickBusy()}
                data-tauri-drag-region-exclude
                onInput={(e) => setQuickTitle(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitQuickAdd();
                }}
              />
              <Show when={quickErr()}>
                <p class="text-xs text-red-600 dark:text-red-400">{quickErr()}</p>
              </Show>
            </div>
            <button
              type="button"
              class="mt-0.5 shrink-0 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={quickBusy() || !quickTitle().trim()}
              data-tauri-drag-region-exclude
              onClick={() => void submitQuickAdd()}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
