import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TaskInstance } from "../types";

export type TodayRefreshPayload = {
  source: string;
  /** Merge these instances into local lists by `id` (append if missing from week/day view). */
  mergeInstances?: TaskInstance[];
  /** Drop this instance id from local lists. */
  removedInstanceId?: string;
  /** Receivers must full reload (reorder, modal save, new template, etc.). */
  needsFullReload?: boolean;
};

/** Apply merge into week-scoped task list; preserves order, appends unseen ids at end. */
export function mergeTaskInstancesIntoWeek(prev: TaskInstance[], incoming: TaskInstance[]): TaskInstance[] {
  if (incoming.length === 0) return prev;
  const byId = new Map(incoming.map((i) => [i.id, i]));
  const prevIds = new Set(prev.map((t) => t.id));
  const next = prev.map((t) => byId.get(t.id) ?? t);
  for (const inst of incoming) {
    if (!prevIds.has(inst.id)) next.push(inst);
  }
  return next;
}

/** Merge instances whose `date` matches `dayYmd` into popover day list. */
export function mergeTaskInstancesIntoDayList(
  prev: TaskInstance[],
  incoming: TaskInstance[],
  dayYmd: string,
): TaskInstance[] {
  const relevant = incoming.filter((i) => i.date === dayYmd);
  if (relevant.length === 0) return prev;
  return mergeTaskInstancesIntoWeek(prev, relevant);
}

/** Apply templateTitle / templateDescription / color from merge payload to every row sharing `templateId`. */
export function applyTemplateFanoutFromMerge(
  rows: TaskInstance[],
  incoming: TaskInstance[],
): TaskInstance[] {
  if (incoming.length === 0) return rows;
  const fanout = new Map<
    string,
    Pick<TaskInstance, "templateTitle" | "templateDescription" | "color">
  >();
  for (const i of incoming) {
    fanout.set(i.templateId, {
      templateTitle: i.templateTitle,
      templateDescription: i.templateDescription,
      color: i.color,
    });
  }
  return rows.map((t) => {
    const f = fanout.get(t.templateId);
    if (!f) return t;
    return {
      ...t,
      templateTitle: f.templateTitle,
      templateDescription: f.templateDescription,
      color: f.color,
    };
  });
}

export function resolveWindowLabel(): string {
  try {
    if (
      typeof window === "undefined" ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ == null
    ) {
      return "main";
    }
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

export type TodayRefreshPatch = Omit<TodayRefreshPayload, "source">;

export async function broadcastTodayTasksChanged(patch?: TodayRefreshPatch): Promise<void> {
  try {
    const payload: TodayRefreshPayload = {
      source: resolveWindowLabel(),
      ...patch,
    };
    await emit<TodayRefreshPayload>("today-refresh", payload);
  } catch (err) {
    console.warn("today-refresh emit", err);
  }
}
