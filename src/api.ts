import { invoke } from "@tauri-apps/api/core";
import type { ReminderSettings, TaskInstance, TaskRule, ThemeMode } from "./types";

export async function getTasksForWeek(weekStart: string): Promise<TaskInstance[]> {
  return invoke<TaskInstance[]>("get_tasks_for_week", { weekStart });
}

export async function getTasksForDate(date: string): Promise<TaskInstance[]> {
  return invoke<TaskInstance[]>("get_tasks_for_date", { date });
}

export async function listTasks(): Promise<TaskRule[]> {
  return invoke<TaskRule[]>("list_tasks");
}

export async function createTask(
  title: string,
  days: number[],
  color: string,
  description: string,
  anchorWeekStart: string,
): Promise<TaskRule> {
  return invoke<TaskRule>("create_task", {
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
  return invoke<TaskRule>("update_task", {
    id,
    title,
    days,
    color,
    description,
    anchorWeekStart,
  });
}

export async function updateTaskTitle(templateId: string, title: string): Promise<TaskRule> {
  return invoke<TaskRule>("update_task_title", { id: templateId, title });
}

export async function cycleTemplateColor(templateId: string): Promise<TaskRule> {
  return invoke<TaskRule>("cycle_template_color", { templateId });
}

export async function deleteTask(id: string): Promise<boolean> {
  return invoke<boolean>("delete_task", { id });
}

export async function removeTaskOccurrence(instanceId: string): Promise<void> {
  return invoke<void>("remove_task_occurrence", { id: instanceId });
}

export async function toggleTaskComplete(id: string): Promise<TaskInstance> {
  return invoke<TaskInstance>("toggle_task_complete", { id });
}

export async function getPreferredTaskColor(): Promise<string> {
  return invoke<string>("get_preferred_task_color");
}

export async function setPreferredTaskColor(color: string): Promise<string> {
  return invoke<string>("set_preferred_task_color", { color });
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  return invoke<ReminderSettings>("get_reminder_settings");
}

export async function setReminderSettings(
  enabled: boolean,
  time: string,
): Promise<ReminderSettings> {
  return invoke<ReminderSettings>("set_reminder_settings", { enabled, time });
}

export async function getThemeMode(): Promise<ThemeMode> {
  return invoke<ThemeMode>("get_theme_mode");
}

export async function setThemeMode(mode: ThemeMode): Promise<ThemeMode> {
  return invoke<ThemeMode>("set_theme_mode", { mode });
}
