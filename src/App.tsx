import {
  batch,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from "solid-js";
import { listen } from "@tauri-apps/api/event";
import * as api from "./api";
import type { ReminderSettings, TaskInstance, TaskRule, ThemeMode } from "./types";
import { formatPrettyRange, formatYmd, startOfWeekMonday } from "./lib/dates";
import {
  applyDomTheme,
  bindSystemColorSchemeListener,
  parseThemeMode,
  publishTheme,
} from "./lib/theme";
import type { CompletionFilter } from "./components/WeekView";
import WeekView from "./components/WeekView";
import FilterBar from "./components/FilterBar";
import TaskRuleModal from "./components/TaskRuleModal";
import TaskDetailModal from "./components/TaskDetailModal";
import {
  applyTemplateFanoutFromMerge,
  broadcastTodayTasksChanged,
  mergeTaskInstancesIntoWeek,
  resolveWindowLabel,
  type TodayRefreshPayload,
} from "./lib/todayRefresh";
import { restoreWindowScrollAfterPaint } from "./lib/scrollRestore";
export default function App() {
  /** Defer tray-driven refresh until task modal closes (skip scroll capture while modal/layout odd). */
  let pendingTodayRefreshAfterModal = false;

  const [weekStart, setWeekStart] = createSignal(startOfWeekMonday(new Date()));
  const [tasks, setTasks] = createSignal<TaskInstance[]>([]);
  const [rules, setRules] = createSignal<TaskRule[]>([]);

  const [completionFilter, setCompletionFilter] = createSignal<CompletionFilter>("all");
  const [colorFilterHex, setColorFilterHex] = createSignal<string | null>(null);

  const [taskModalOpen, setTaskModalOpen] = createSignal(false);
  const [taskEditing, setTaskEditing] = createSignal<TaskRule | null>(null);
  const [taskModalInitialWeekdays, setTaskModalInitialWeekdays] = createSignal<number[]>([]);
  const [detailTask, setDetailTask] = createSignal<TaskInstance | null>(null);
  const [detailOpen, setDetailOpen] = createSignal(false);

  const [reminder, setReminder] = createSignal<ReminderSettings>({
    enabled: false,
    time: "09:00",
  });
  const [themeMode, setThemeMode] = createSignal<ThemeMode>("system");

  const loadWeek = async () => {
    const start = formatYmd(untrack(weekStart));
    const t = await api.getTasksForWeek(start);
    batch(() => setTasks(t));
  };

  const loadMeta = async () => {
    const [r, rem] = await Promise.all([api.listTasks(), api.getReminderSettings()]);
    batch(() => {
      setRules(r);
      setReminder(rem);
    });
  };

  const refreshAll = async () => {
    const sx = window.scrollX;
    const sy = window.scrollY;
    try {
      await Promise.all([loadWeek(), loadMeta()]);
    } catch (e) {
      console.error("refreshAll", e);
      throw e;
    }
    restoreWindowScrollAfterPaint(sx, sy);
  };

  const cycleTemplateColorApp = async (templateId: string) => {
    const r = await api.cycleTemplateColor(templateId);
    const col = r.color;
    let merged: TaskInstance[] = [];
    batch(() => {
      setTasks((prev) => {
        const next = prev.map((t) => (t.templateId === templateId ? { ...t, color: col } : t));
        merged = next.filter((t) => t.templateId === templateId);
        return next;
      });
      setRules((prev) => prev.map((rule) => (rule.id === templateId ? { ...rule, color: col } : rule)));
      setDetailTask((dt) => (dt && dt.templateId === templateId ? { ...dt, color: col } : dt));
    });
    void api.setPreferredTaskColor(col).catch(() => undefined);
    void broadcastTodayTasksChanged({ mergeInstances: merged });
  };

  onMount(() => {
    void refreshAll().catch((err) => console.error("Startup refreshFailed", err));

    let unlistenTheme: (() => void) | undefined;
    const unbindMql = bindSystemColorSchemeListener();
    void api.getThemeMode().then((raw) => {
      const m = parseThemeMode(raw);
      batch(() => {
        setThemeMode(m);
        applyDomTheme(m);
      });
    });
    void listen<{ mode: ThemeMode }>("theme-changed", (event) => {
      const m = parseThemeMode(event.payload.mode);
      batch(() => {
        setThemeMode(m);
        applyDomTheme(m);
      });
    }).then((u) => {
      unlistenTheme = u;
    });
    let unlistenToday: (() => void) | undefined;
    const selfWin = resolveWindowLabel();
    void listen<TodayRefreshPayload>("today-refresh", (event) => {
      if (event.payload?.source === selfWin) return;
      const p = event.payload;
      const deferFull = () => {
        untrack(() => {
          if (taskModalOpen()) pendingTodayRefreshAfterModal = true;
          else void refreshAll().catch((err) => console.error("today-refresh listener", err));
        });
      };

      if (!p || p.needsFullReload) {
        deferFull();
        return;
      }
      if (p.removedInstanceId) {
        const rid = p.removedInstanceId;
        const openDetail = untrack(() => detailTask());
        batch(() => {
          setTasks((prev) => prev.filter((t) => t.id !== rid));
          if (openDetail?.id === rid) {
            setDetailOpen(false);
            setDetailTask(null);
          }
        });
        return;
      }
      if (p.mergeInstances?.length) {
        batch(() => {
          setTasks((prev) =>
            applyTemplateFanoutFromMerge(
              mergeTaskInstancesIntoWeek(prev, p.mergeInstances!),
              p.mergeInstances!,
            ),
          );
          setDetailTask((dt) => {
            if (!dt) return dt;
            const m = p.mergeInstances!.find((i) => i.id === dt.id);
            if (m) return m;
            const f = p.mergeInstances!.find((i) => i.templateId === dt.templateId);
            return f
              ? {
                  ...dt,
                  templateTitle: f.templateTitle,
                  templateDescription: f.templateDescription,
                  color: f.color,
                }
              : dt;
          });
        });
        return;
      }
      deferFull();
    }).then((u) => {
      unlistenToday = u;
    });
    onCleanup(() => {
      unbindMql();
      unlistenTheme?.();
      unlistenToday?.();
    });
  });

  createEffect(() => {
    if (taskModalOpen()) return;
    if (!pendingTodayRefreshAfterModal) return;
    pendingTodayRefreshAfterModal = false;
    void refreshAll().catch((err) =>
      console.error("today-refresh deferred after modal", err),
    );
  });

  const shiftWeek = (delta: number) => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(prev.getDate() + delta * 7);
      const next = startOfWeekMonday(d);
      void api.getTasksForWeek(formatYmd(next)).then((t) =>
        batch(() => setTasks(t)),
      );
      return next;
    });
  };

  const openNewTask = (weekdayNums: number[]) => {
    batch(() => {
      setTaskEditing(null);
      setTaskModalInitialWeekdays(weekdayNums);
      setTaskModalOpen(true);
    });
  };

  const openEditRule = (templateId: string) => {
    const r = rules().find((x) => x.id === templateId);
    if (r) {
      batch(() => {
        setTaskEditing(r);
        setTaskModalInitialWeekdays([]);
        setTaskModalOpen(true);
      });
    }
  };

  const removeFromDay = async (instanceId: string) => {
    await api.removeTaskOccurrence(instanceId);
    const openDetail = untrack(() => detailTask());
    batch(() => {
      setTasks((prev) => prev.filter((t) => t.id !== instanceId));
      if (openDetail?.id === instanceId) {
        setDetailOpen(false);
        setDetailTask(null);
      }
    });
    void broadcastTodayTasksChanged({ removedInstanceId: instanceId });
  };

  const deleteTaskSeries = async (templateId: string) => {
    await api.deleteTask(templateId);
    await refreshAll();
    void broadcastTodayTasksChanged({ needsFullReload: true });
  };

  return (
    <div class="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header class="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <img
            src="/fasttodo.png"
            alt=""
            width="40"
            height="40"
            class="h-10 w-10 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-black/10 dark:ring-white/10"
          />
          <div>
            <h1 class="text-lg font-bold tracking-tight">Fast Todo</h1>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              Add tasks per day · tray quick view
            </p>
          </div>
        </div>
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              Theme
              <select
                class="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                value={themeMode()}
                onChange={async (e) => {
                  const v = e.currentTarget.value as ThemeMode;
                  setThemeMode(v);
                  applyDomTheme(v);
                  await api.setThemeMode(v);
                  await publishTheme(v);
                }}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <button
              type="button"
              class="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600"
              onClick={() => shiftWeek(-1)}
            >
              ← Prev
            </button>
            <span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {formatPrettyRange(weekStart())}
            </span>
            <button
              type="button"
              class="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600"
              onClick={() => shiftWeek(1)}
            >
              Next →
            </button>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-3xl px-4 py-4">
        <section class="mb-6 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div class="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Daily reminder
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reminder().enabled}
                onChange={async (e) => {
                  const en = e.currentTarget.checked;
                  const r = await api.setReminderSettings(en, reminder().time);
                  batch(() => setReminder(r));
                }}
              />
              Enabled
            </label>
            <input
              type="time"
              class="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              value={reminder().time}
              onChange={async (e) => {
                const r = await api.setReminderSettings(reminder().enabled, e.currentTarget.value);
                batch(() => setReminder(r));
              }}
            />
          </div>
        </section>

        <div class="mb-4">
          <FilterBar
            completionFilter={completionFilter()}
            onCompletionChange={setCompletionFilter}
            colorFilterHex={colorFilterHex()}
            onColorFilterChange={setColorFilterHex}
          />
        </div>

        <WeekView
          weekStart={weekStart()}
          tasks={tasks()}
          completionFilter={completionFilter()}
          colorFilterHex={colorFilterHex()}
          dragEnabled={completionFilter() === "all" && colorFilterHex() === null}
          onAfterTaskDrag={async () => {
            await refreshAll();
            await broadcastTodayTasksChanged({ needsFullReload: true });
          }}
          onToggle={async (id) => {
            const u = await api.toggleTaskComplete(id);
            batch(() => setTasks((prev) => prev.map((t) => (t.id === u.id ? u : t))));
            await broadcastTodayTasksChanged({ mergeInstances: [u] });
          }}
          onNewItem={(weekdayNum) => openNewTask([weekdayNum])}
          onEditRule={openEditRule}
          onRemoveFromDay={(id) => void removeFromDay(id)}
          onCycleTemplateColor={(id) => void cycleTemplateColorApp(id)}
          onOpenDetail={(task) => {
            batch(() => {
              setDetailTask(task);
              setDetailOpen(true);
            });
          }}
        />
      </main>

      <TaskRuleModal
        open={taskModalOpen()}
        editing={taskEditing()}
        weekAnchorMonday={formatYmd(weekStart())}
        initialWeekdays={taskModalInitialWeekdays()}
        onClose={() => setTaskModalOpen(false)}
        onSaved={() => {
          void refreshAll()
            .then(() => broadcastTodayTasksChanged({ needsFullReload: true }))
            .catch((err) => console.error("modal onSaved refresh", err));
        }}
        onCreate={async (title, days, col, description, anchorWeekStart) => {
          await api.createTask(title, days, col, description, anchorWeekStart);
        }}
        onUpdate={async (id, title, days, col, description, anchorWeekStart) => {
          await api.updateTask(id, title, days, col, description, anchorWeekStart);
        }}
        onDeleteSeries={(templateId: string) => deleteTaskSeries(templateId)}
      />

      <TaskDetailModal
        open={detailOpen()}
        task={detailTask()}
        onClose={() => {
          batch(() => {
            setDetailOpen(false);
            setDetailTask(null);
          });
        }}
        onEditSchedule={() => {
          const task = detailTask();
          if (task) openEditRule(task.templateId);
        }}
        onCycleTemplateColor={(id) => void cycleTemplateColorApp(id)}
      />
    </div>
  );
}
