import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import * as api from "../api";
import { applyDomTheme, bindSystemColorSchemeListener, parseThemeMode } from "../lib/theme";
import type { PropertySchema, TaskInstance, ThemeMode } from "../types";
import { formatYmd } from "../lib/dates";

const MARGIN_PX = 16;

function schemasToShow(schemas: PropertySchema[], hiddenSchemaIds: string[]): PropertySchema[] {
  if (!hiddenSchemaIds.length) return schemas;
  const hidden = new Set(hiddenSchemaIds);
  return schemas.filter((s) => !hidden.has(s.id));
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

export default function TodayPopover() {
  const [tasks, setTasks] = createSignal<TaskInstance[]>([]);
  const [schemas, setSchemas] = createSignal<PropertySchema[]>([]);
  const [hiddenSchemaIds, setHiddenSchemaIds] = createSignal<string[]>([]);
  const [expandedTaskId, setExpandedTaskId] = createSignal<string | null>(null);

  const todayLabel = () =>
    new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  const load = async () => {
    const d = formatYmd(new Date());
    const [ta, s, disp] = await Promise.all([
      api.getTasksForDate(d),
      api.listPropertySchemas(),
      api.getPropertyDisplaySettings(),
    ]);
    setTasks(ta);
    setSchemas(s);
    setHiddenSchemaIds(disp.hiddenSchemaIds);
  };

  const toggleDescription = (id: string) => {
    setExpandedTaskId((prev) => (prev === id ? null : id));
  };

  onMount(() => {
    void positionBottomRightWorkArea();
    void load();

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

  const showSchemas = () => schemasToShow(schemas(), hiddenSchemaIds());

  return (
    <div class="box-border min-h-screen overflow-hidden rounded-xl bg-zinc-100 text-zinc-900 ring-1 ring-zinc-300 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-zinc-700/80">
      <header class="flex items-stretch gap-1 border-b border-zinc-200 bg-white/90 pr-1 dark:border-zinc-800 dark:bg-zinc-900/90">
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
      <div class="p-3">
        <div class="flex flex-col gap-2">
          <For each={tasks()}>
            {(t) => {
              const descText = (t.templateDescription ?? "").trim();
              const hasDesc = descText.length > 0;
              const expanded = () => expandedTaskId() === t.id;
              const titleClass = () =>
                `text-sm ${
                  t.completed ? "text-zinc-400 line-through dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-100"
                }`;
              return (
                <div class="flex gap-2 rounded-md border border-zinc-200 bg-white px-2 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  <input
                    type="checkbox"
                    class="mt-1 h-4 w-4 shrink-0"
                    data-tauri-drag-region-exclude
                    checked={t.completed}
                    onChange={async () => {
                      const u = await api.toggleTaskComplete(t.id);
                      setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
                    }}
                  />
                  <div class="flex min-w-0 flex-1 flex-col gap-2">
                    <Show
                      when={hasDesc}
                      fallback={<div class={titleClass()}>{t.templateTitle}</div>}
                    >
                      <button
                        type="button"
                        class={`w-full ${titleClass()} cursor-pointer text-left hover:underline`}
                        aria-expanded={expanded()}
                        data-tauri-drag-region-exclude
                        onClick={() => toggleDescription(t.id)}
                      >
                        {t.templateTitle}
                      </button>
                    </Show>
                    <Show when={expanded() && hasDesc}>
                      <p class="whitespace-pre-wrap border-l-2 border-zinc-300 pl-2 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
                        {descText}
                      </p>
                    </Show>
                    <Show when={showSchemas().length > 0}>
                      <div class="flex flex-wrap justify-end gap-2">
                        <For each={showSchemas()}>
                          {(s) => {
                            const currentVal = () => (t.properties ?? {})[s.id] ?? "";
                            const selectedOpt = () => s.options.find((o) => o.value === currentVal());
                            return (
                              <select
                                data-tauri-drag-region-exclude
                                title={`${s.name}${selectedOpt() ? `: ${selectedOpt()!.label}` : ""}`}
                                class="max-w-44 cursor-pointer rounded-full border-0 py-1 pl-2 pr-7 text-[10px] font-medium text-white shadow-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-blue-400/50 [&>option]:bg-zinc-800 [&>option]:text-zinc-100"
                                style={{
                                  "background-color": selectedOpt()?.color ?? "#52525b",
                                  color: "#fff",
                                }}
                                value={currentVal()}
                                onChange={async (e) => {
                                  const u = await api.setTaskProperty(t.id, s.id, e.currentTarget.value);
                                  setTasks((prev) => prev.map((x) => (x.id === u.id ? u : x)));
                                }}
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
                </div>
              );
            }}
          </For>
        </div>
        {tasks().length === 0 && (
          <p class="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-500">Nothing scheduled today</p>
        )}
      </div>
    </div>
  );
}
