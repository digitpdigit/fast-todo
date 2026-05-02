import {
  batch,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import * as api from "../api";
import {
  applyDomTheme,
  bindSystemColorSchemeListener,
  parseThemeMode,
} from "../lib/theme";
import type { TaskInstance, ThemeMode } from "../types";
import { formatYmd, startOfWeekMonday, weekdayNumFromDate } from "../lib/dates";
import {
  DEFAULT_TASK_HEX,
  nextPresetHex,
  normalizeHex,
} from "../lib/taskColors";
import {
  TASK_FROM_DATE_MIME,
  TASK_INSTANCE_MIME,
  dataTransferHasTaskPayload,
} from "../lib/dragIds";
import {
  applyTemplateFanoutFromMerge,
  broadcastTodayTasksChanged,
  mergeTaskInstancesIntoDayList,
  resolveWindowLabel,
  type TodayRefreshPayload,
} from "../lib/todayRefresh";
import { restoreElementScrollAfterPaint } from "../lib/scrollRestore";
import { dropSlotFromPointer, reorderDraggableIds } from "../lib/taskDnD";
import PopoverTaskRow from "./PopoverTaskRow";

const MARGIN_PX = 16;

async function positionBottomRightWorkArea() {
  try {
    if (
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__ == null
    )
      return;
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

export default function TodayPopover() {
  /** Popover task list scroller — preserve position across `load()` */
  let taskListScrollRoot: HTMLDivElement | undefined;

  const [viewDate, setViewDate] = createSignal(new Date());

  const [tasks, setTasks] = createSignal<TaskInstance[]>([]);
  const [expandedTaskId, setExpandedTaskId] = createSignal<string | null>(null);
  const [quickTitle, setQuickTitle] = createSignal("");
  const [quickBusy, setQuickBusy] = createSignal(false);
  const [quickErr, setQuickErr] = createSignal("");
  const [previewColor, setPreviewColor] = createSignal(DEFAULT_TASK_HEX);
  const [editingInstanceId, setEditingInstanceId] = createSignal<string | null>(
    null,
  );
  const [editDraft, setEditDraft] = createSignal("");
  /** Row targeted by async mutation (color/delete/save); drag blocked while non-null. */
  const [busyInstanceId, setBusyInstanceId] = createSignal<string | null>(null);

  const headerLabel = () => {
    const d = viewDate();
    const formatted = d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    if (formatYmd(d) === formatYmd(new Date())) return `Today — ${formatted}`;
    return formatted;
  };

  const dayYmd = () => formatYmd(viewDate());

  const load = async () => {
    const d = untrack(dayYmd);
    const ta = await api.getTasksForDate(d);
    const prevTop = taskListScrollRoot?.scrollTop ?? 0;
    batch(() => setTasks(ta));
    restoreElementScrollAfterPaint(prevTop, () => taskListScrollRoot);
  };

  const bumpViewDay = (delta: number) => {
    const x = untrack(() => new Date(viewDate()));
    x.setDate(x.getDate() + delta);
    setViewDate(x);
    void load().catch((e) => console.error("TodayPopover.load bump day", e));
  };

  const taskDragAllowed = () =>
    !quickBusy() && busyInstanceId() === null && editingInstanceId() === null;

  const onDragStartRow = (t: TaskInstance) => (e: DragEvent) => {
    if (!taskDragAllowed()) return;
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.setData(TASK_INSTANCE_MIME, t.id);
    dt.setData(TASK_FROM_DATE_MIME, t.date);
    dt.effectAllowed = "move";
  };

  const onDragOverTaskList = (e: DragEvent) => {
    if (!dataTransferHasTaskPayload(e.dataTransfer)) return;
    e.preventDefault();
    const dt = e.dataTransfer;
    if (dt) dt.dropEffect = taskDragAllowed() ? "move" : "none";
  };

  const onDropTaskList = async (e: DragEvent) => {
    if (!dataTransferHasTaskPayload(e.dataTransfer)) return;
    e.preventDefault();
    if (!taskDragAllowed()) return;
    const id = e.dataTransfer?.getData(TASK_INSTANCE_MIME) ?? "";
    const fromDate = e.dataTransfer?.getData(TASK_FROM_DATE_MIME) ?? "";
    if (!id || !fromDate) return;

    const { targetYmd, idsOnTarget } = untrack(() => ({
      targetYmd: dayYmd(),
      idsOnTarget: tasks().map((x) => x.id),
    }));

    let idsOnSource = idsOnTarget;
    if (fromDate !== targetYmd) {
      const srcTasks = await api.getTasksForDate(fromDate);
      idsOnSource = srcTasks.map((x) => x.id);
    }

    const fromIdx = idsOnSource.indexOf(id);
    if (fromIdx < 0) return;

    const rawIdxUncapped = dropSlotFromPointer(e.clientY, taskListScrollRoot);
    let rawIdx = Math.max(0, Math.min(rawIdxUncapped, idsOnTarget.length));

    try {
      if (fromDate === targetYmd) {
        const next = reorderDraggableIds(idsOnSource, fromIdx, rawIdx);
        const sameOrder = next.every((nid, i) => nid === idsOnSource[i]);
        if (!sameOrder) await api.reorderTaskInstances(targetYmd, next);
      } else {
        rawIdx = Math.max(0, Math.min(rawIdx, idsOnTarget.length));
        await api.moveTaskInstance(id, targetYmd, rawIdx);
      }
      await load().catch((e) =>
        console.error("TodayPopover.load after drop", e),
      );
      await broadcastTodayTasksChanged({ needsFullReload: true });
    } catch (err) {
      console.error("popover task drop", err);
    }
  };

  const submitQuickAdd = async () => {
    const title = quickTitle().trim();
    if (!title || quickBusy()) return;
    setQuickErr("");
    setQuickBusy(true);
    try {
      const vd = untrack(viewDate);
      const anchorMonday = formatYmd(startOfWeekMonday(vd));
      const dow = weekdayNumFromDate(vd);
      const col = normalizeHex(untrack(previewColor));
      await api.createTask(title, [dow], col, "", anchorMonday);
      void api.setPreferredTaskColor(col).catch(() => undefined);
      batch(() => setQuickTitle(""));
      await load().catch((e) =>
        console.error("TodayPopover.load after quick add", e),
      );
      await broadcastTodayTasksChanged({ needsFullReload: true });
    } catch (e) {
      batch(() => setQuickErr(e instanceof Error ? e.message : String(e)));
    } finally {
      batch(() => setQuickBusy(false));
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
    if (!iid || busyInstanceId() !== null) return;
    const t = tasks().find((x) => x.id === iid);
    if (!t) return;
    const nt = editDraft().trim();
    if (!nt) return;
    setBusyInstanceId(iid);
    let merged: TaskInstance[] = [];
    try {
      await api.updateTaskTitle(t.templateId, nt);
      batch(() => {
        cancelEdit();
        setTasks((prev) => {
          const next = prev.map((x) =>
            x.templateId === t.templateId ? { ...x, templateTitle: nt } : x,
          );
          merged = next.filter((x) => x.templateId === t.templateId);
          return next;
        });
      });
      await broadcastTodayTasksChanged({ mergeInstances: merged });
    } catch (e) {
      console.error(e);
    } finally {
      batch(() => setBusyInstanceId(null));
    }
  };

  const deleteSeries = async (t: TaskInstance) => {
    if (busyInstanceId() !== null) return;
    setBusyInstanceId(t.id);
    try {
      if (untrack(editingInstanceId) === t.id) batch(() => cancelEdit());
      await api.deleteTask(t.templateId);
      batch(() =>
        setTasks((prev) => prev.filter((x) => x.templateId !== t.templateId)),
      );
      await broadcastTodayTasksChanged({ needsFullReload: true });
    } catch (e) {
      console.error(e);
    } finally {
      batch(() => setBusyInstanceId(null));
    }
  };

  const cycleRowColor = async (t: TaskInstance) => {
    if (busyInstanceId() !== null) return;
    setBusyInstanceId(t.id);
    let merged: TaskInstance[] = [];
    try {
      const r = await api.cycleTemplateColor(t.templateId);
      const col = r.color;
      batch(() =>
        setTasks((prev) => {
          const next = prev.map((x) =>
            x.templateId === t.templateId ? { ...x, color: col } : x,
          );
          merged = next.filter((x) => x.templateId === t.templateId);
          return next;
        }),
      );
      void api.setPreferredTaskColor(col).catch(() => undefined);
      await broadcastTodayTasksChanged({ mergeInstances: merged });
    } catch (e) {
      console.error(e);
    } finally {
      batch(() => setBusyInstanceId(null));
    }
  };

  const toggleDescription = (id: string) => {
    setExpandedTaskId((prev) => (prev === id ? null : id));
  };

  onMount(() => {
    void positionBottomRightWorkArea();
    void load().catch((e) => console.error("TodayPopover initial load", e));
    void api.getPreferredTaskColor().then((c) => {
      batch(() => setPreviewColor(normalizeHex(c)));
    });

    const unbindMql = bindSystemColorSchemeListener();
    void api.getThemeMode().then((raw) => {
      const m = parseThemeMode(raw);
      batch(() => applyDomTheme(m));
    });

    let unlistenRefresh: (() => void) | undefined;
    let unlistenTheme: (() => void) | undefined;
    const selfLabel = resolveWindowLabel();
    void listen<TodayRefreshPayload>("today-refresh", (event) => {
      if (event.payload?.source === selfLabel) return;
      const p = event.payload;
      const fullReload = () => {
        void load().catch((e) =>
          console.error("TodayPopover today-refresh load", e),
        );
      };

      if (!p || p.needsFullReload) {
        fullReload();
        return;
      }
      if (p.removedInstanceId) {
        const rid = p.removedInstanceId;
        batch(() => setTasks((prev) => prev.filter((t) => t.id !== rid)));
        return;
      }
      if (p.mergeInstances?.length) {
        const ymd = untrack(dayYmd);
        const relevant = p.mergeInstances.filter((i) => i.date === ymd);
        batch(() =>
          setTasks((prev) =>
            applyTemplateFanoutFromMerge(
              mergeTaskInstancesIntoDayList(prev, p.mergeInstances!, ymd),
              relevant,
            ),
          ),
        );
        return;
      }
      fullReload();
    }).then((u) => {
      unlistenRefresh = u;
    });
    void listen<{ mode: ThemeMode }>("theme-changed", (event) => {
      const m = parseThemeMode(event.payload.mode);
      batch(() => applyDomTheme(m));
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
    <div class="box-border flex h-screen max-h-screen min-h-0 flex-col overflow-hidden rounded-xl bg-zinc-100 text-zinc-900 ring-1 ring-zinc-300 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700/80">
      <header class="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-white/90 px-2 dark:border-zinc-800 dark:bg-zinc-900/90">
        <div
          data-tauri-drag-region
          class="flex min-w-0 flex-1 select-none items-center gap-2 py-2"
        >
          <img
            src="/fasttodo.png"
            alt=""
            width="28"
            height="28"
            class="h-7 w-7 shrink-0 rounded-lg object-cover opacity-95 ring-1 ring-black/10 dark:ring-white/10"
          />
          <button
            type="button"
            title="Previous day"
            aria-label="Previous day"
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            data-tauri-drag-region-exclude=""
            disabled={quickBusy()}
            onClick={() => bumpViewDay(-1)}
          >
            ←
          </button>
          <span class="min-w-0 flex-1 truncate text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {headerLabel()}
          </span>
          <button
            type="button"
            title="Next day"
            aria-label="Next day"
            class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            data-tauri-drag-region-exclude=""
            disabled={quickBusy()}
            onClick={() => bumpViewDay(1)}
          >
            →
          </button>
        </div>
        <button
          type="button"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          title="Close"
          aria-label="Close"
          data-tauri-drag-region-exclude=""
          onClick={() => void hideWindow()}
        >
          <span class="text-lg leading-none">×</span>
        </button>
      </header>

      <div class="flex min-h-0 flex-1 flex-col">
        <div
          class="min-h-0 flex-1 overflow-y-auto px-3 pt-2"
          ref={(el) => {
            taskListScrollRoot = el;
          }}
          data-task-droplist=""
          onDragOver={onDragOverTaskList}
          onDrop={(e) => void onDropTaskList(e)}
        >
          <For each={tasks()}>
            {(t) => (
              <PopoverTaskRow
                task={t}
                expandedTaskId={expandedTaskId}
                editingInstanceId={editingInstanceId}
                busyInstanceId={busyInstanceId}
                quickBusy={quickBusy}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                onDragStartRow={onDragStartRow(t)}
                onCycleColor={() => void cycleRowColor(t)}
                onToggleComplete={() => {
                  void (async () => {
                    const u = await api.toggleTaskComplete(t.id);
                    batch(() =>
                      setTasks((prev) =>
                        prev.map((x) => (x.id === u.id ? u : x)),
                      ),
                    );
                    await broadcastTodayTasksChanged({ mergeInstances: [u] });
                  })();
                }}
                onToggleDescription={() => toggleDescription(t.id)}
                onStartEdit={() => startEdit(t)}
                onDeleteSeries={() => void deleteSeries(t)}
                onSaveEdit={() => void saveEdit()}
                onCancelEdit={() => cancelEdit()}
              />
            )}
          </For>
          {tasks().length === 0 && (
            <p class="py-2 text-center text-sm text-zinc-500 dark:text-zinc-500">
              Nothing scheduled this day
            </p>
          )}
        </div>

        <div class="shrink-0 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <div class="flex gap-2 rounded-md border border-zinc-200 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900 items-center">
            <button
              type="button"
              class="mt-1 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15 ring-offset-1 ring-offset-white dark:ring-white/20 dark:ring-offset-zinc-900"
              style={{ "background-color": previewColor() }}
              title="Next color (new tasks)"
              aria-label="Cycle color for new task"
              data-tauri-drag-region-exclude=""
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
                data-tauri-drag-region-exclude=""
                onInput={(e) => setQuickTitle(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitQuickAdd();
                }}
              />
              <Show when={quickErr()}>
                <p class="text-xs text-red-600 dark:text-red-400">
                  {quickErr()}
                </p>
              </Show>
            </div>
            <button
              type="button"
              class="mt-0.5 shrink-0 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={quickBusy() || !quickTitle().trim()}
              data-tauri-drag-region-exclude=""
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
