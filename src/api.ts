import { invoke } from "@tauri-apps/api/core";
import type { ReminderSettings, TaskInstance, TaskRule, ThemeMode } from "./types";

async function ipc<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    console.error(`[tauri:${cmd}]`, e);
    throw e;
  }
}

export async function getTasksForWeek(weekStart: string): Promise<TaskInstance[]> {
  return ipc<TaskInstance[]>("get_tasks_for_week", { weekStart });
}

export async function getTasksForDate(date: string): Promise<TaskInstance[]> {
  return ipc<TaskInstance[]>("get_tasks_for_date", { date });
}

export async function listTasks(): Promise<TaskRule[]> {
  return ipc<TaskRule[]>("list_tasks");
}

export async function createTask(
  title: string,
  days: number[],
  color: string,
  description: string,
  anchorWeekStart: string,
): Promise<TaskRule> {
  return ipc<TaskRule>("create_task", {
    title,
    days,
    color,
    description,
    anchorWeekStart,
  });
}

export async function updateTask(
  id: string,
  title: string,
  days: number[],
  color: string,
  description: string,
  anchorWeekStart: string,
): Promise<TaskRule> {
  return ipc<TaskRule>("update_task", {
    id,
    title,
    days,
    color,
    description,
    anchorWeekStart,
  });
}

export async function updateTaskTitle(templateId: string, title: string): Promise<TaskRule> {
  return ipc<TaskRule>("update_task_title", { id: templateId, title });
}

export async function cycleTemplateColor(templateId: string): Promise<TaskRule> {
  return ipc<TaskRule>("cycle_template_color", { templateId });
}

export async function deleteTask(id: string): Promise<boolean> {
  return ipc<boolean>("delete_task", { id });
}

export async function removeTaskOccurrence(instanceId: string): Promise<void> {
  return ipc<void>("remove_task_occurrence", { id: instanceId });
}

export async function toggleTaskComplete(id: string): Promise<TaskInstance> {
  return ipc<TaskInstance>("toggle_task_complete", { id });
}

export async function getPreferredTaskColor(): Promise<string> {
  return ipc<string>("get_preferred_task_color");
}

export async function setPreferredTaskColor(color: string): Promise<string> {
  return ipc<string>("set_preferred_task_color", { color });
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  return ipc<ReminderSettings>("get_reminder_settings");
}

export async function setReminderSettings(
  enabled: boolean,
  time: string,
): Promise<ReminderSettings> {
  return ipc<ReminderSettings>("set_reminder_settings", { enabled, time });
}

export async function getThemeMode(): Promise<ThemeMode> {
  return ipc<ThemeMode>("get_theme_mode");
}

export async function setThemeMode(mode: ThemeMode): Promise<ThemeMode> {
  return ipc<ThemeMode>("set_theme_mode", { mode });
}

export async function reorderTaskInstances(dateYmd: string, orderedInstanceIds: string[]): Promise<void> {
  return ipc<void>("reorder_task_instances", {
    date_ymd: dateYmd,
    ordered_instance_ids: orderedInstanceIds,
  });
}

export async function moveTaskInstance(instanceId: string, newDateYmd: string, insertIndex: number): Promise<void> {
  return ipc<void>("move_task_instance", {
    instance_id: instanceId,
    new_date_ymd: newDateYmd,
    insert_index: insertIndex,
  });
}