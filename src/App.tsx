import { batch, createSignal, onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import * as api from "./api";
import type { PropertySchema, ReminderSettings, TaskInstance, TaskRule, ThemeMode } from "./types";
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
import PropertyModal from "./components/PropertyModal";
import TaskDetailModal from "./components/TaskDetailModal";
import PropertyManageBar from "./components/PropertyManageBar";

export default function App() {
  const [weekStart, setWeekStart] = createSignal(startOfWeekMonday(new Date()));
  const [tasks, setTasks] = createSignal<TaskInstance[]>([]);
  const [rules, setRules] = createSignal<TaskRule[]>([]);
  const [schemas, setSchemas] = createSignal<PropertySchema[]>([]);
  const [hiddenSchemaIds, setHiddenSchemaIds] = createSignal<string[]>([]);

  const [completionFilter, setCompletionFilter] = createSignal<CompletionFilter>("all");
  const [propertyFilters, setPropertyFilters] = createSignal<Record<string, string>>({});

  const [taskModalOpen, setTaskModalOpen] = createSignal(false);
  const [taskEditing, setTaskEditing] = createSignal<TaskRule | null>(null);
  const [taskModalInitialWeekdays, setTaskModalInitialWeekdays] = createSignal<number[]>([]);
  const [propertyModalOpen, setPropertyModalOpen] = createSignal(false);
  const [detailTask, setDetailTask] = createSignal<TaskInstance | null>(null);
  const [detailOpen, setDetailOpen] = createSignal(false);

  const [reminder, setReminder] = createSignal<ReminderSettings>({
    enabled: false,
    time: "09:00",
  });
  const [themeMode, setThemeMode] = createSignal<ThemeMode>("system");

  const loadWeek = async () => {
    const start = formatYmd(weekStart());
    const t = await api.getTasksForWeek(start);
    setTasks(t);
  };

  const loadMeta = async () => {
    const [r, sch, rem, disp] = await Promise.all([
      api.listTasks(),
      api.listPropertySchemas(),
      api.getReminderSettings(),
      api.getPropertyDisplaySettings(),
    ]);
    setRules(r);
    setSchemas(sch);
    setReminder(rem);
    setHiddenSchemaIds(disp.hiddenSchemaIds);
  };

  const refreshAll = async () => {
    try {
      await Promise.all([loadWeek(), loadMeta()]);
    } catch (e) {
      console.error("refreshAll", e);
      throw e;
    }
  };

  onMount(() => {
    void refreshAll();

    let unlistenTheme: (() => void) | undefined;
    const unbindMql = bindSystemColorSchemeListener();
    void api.getThemeMode().then((raw) => {
      const m = parseThemeMode(raw);
      setThemeMode(m);
      applyDomTheme(m);
    });
    void listen<{ mode: ThemeMode }>("theme-changed", (event) => {
      const m = parseThemeMode(event.payload.mode);
      setThemeMode(m);
      applyDomTheme(m);
    }).then((u) => {
      unlistenTheme = u;
    });
    onCleanup(() => {
      unbindMql();
      unlistenTheme?.();
    });
  });

  const shiftWeek = (delta: number) => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(prev.getDate() + delta * 7);
      const next = startOfWeekMonday(d);
      void api.getTasksForWeek(formatYmd(next)).then(setTasks);
      return next;
    });
  };

  const onPropertyFilterChange = (schemaId: string, value: string) => {
    setPropertyFilters((prev) => ({ ...prev, [schemaId]: value }));
  };

  const persistHidden = async (ids: string[]) => {
    setHiddenSchemaIds(ids);
    await api.setPropertyDisplaySettings(ids);
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

  const deleteRule = async (templateId: string) => {
    await api.deleteTask(templateId);
    await refreshAll();
  };

  return (
    <div class="min-h-screen bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header class="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="text-lg font-bold tracking-tight">Weekly Todo</h1>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              Add tasks per day · tray quick view
            </p>
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
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            onClick={() => setPropertyModalOpen(true)}
          >
            + Property
          </button>
        </div>

        <PropertyManageBar schemas={schemas()} onDeleted={() => void refreshAll()} />

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
                  setReminder(r);
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
                setReminder(r);
              }}
            />
          </div>
        </section>

        <div class="mb-4">
          <FilterBar
            schemas={schemas()}
            completionFilter={completionFilter()}
            onCompletionChange={setCompletionFilter}
            propertyFilters={propertyFilters()}
            onPropertyFilterChange={onPropertyFilterChange}
            hiddenSchemaIds={hiddenSchemaIds()}
            onHiddenSchemaIdsChange={(ids) => void persistHidden(ids)}
          />
        </div>

        <WeekView
          weekStart={weekStart()}
          tasks={tasks()}
          schemas={schemas()}
          hiddenSchemaIds={hiddenSchemaIds()}
          completionFilter={completionFilter()}
          propertyFilters={propertyFilters()}
          onToggle={async (id) => {
            const u = await api.toggleTaskComplete(id);
            setTasks((prev) => prev.map((t) => (t.id === u.id ? u : t)));
          }}
          onPropertyChange={async (id, schemaId, value) => {
            const u = await api.setTaskProperty(id, schemaId, value);
            setTasks((prev) => prev.map((t) => (t.id === u.id ? u : t)));
          }}
          onNewItem={(weekdayNum) => openNewTask([weekdayNum])}
          onEditRule={openEditRule}
          onDeleteRule={(tid) => void deleteRule(tid)}
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
        schemas={schemas()}
        editing={taskEditing()}
        weekAnchorMonday={formatYmd(weekStart())}
        initialWeekdays={taskModalInitialWeekdays()}
        onClose={() => setTaskModalOpen(false)}
        onSaved={() => void refreshAll()}
        onCreate={async (title, days, dp, description, anchorWeekStart) => {
          await api.createTask(title, days, dp, description, anchorWeekStart);
        }}
        onUpdate={async (id, title, days, dp, description, anchorWeekStart) => {
          await api.updateTask(id, title, days, dp, description, anchorWeekStart);
        }}
      />

      <TaskDetailModal
        open={detailOpen()}
        task={detailTask()}
        schemas={schemas()}
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
      />

      <PropertyModal
        open={propertyModalOpen()}
        onClose={() => setPropertyModalOpen(false)}
        onSaved={() => void refreshAll()}
      />
    </div>
  );
}
