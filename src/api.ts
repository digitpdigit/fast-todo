import { invoke } from "@tauri-apps/api/core";
import type {
  NewPropertyOptionInput,
  PropertyDisplaySettings,
  PropertySchema,
  ReminderSettings,
  TaskInstance,
  TaskRule,
  ThemeMode,
} from "./types";

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
  defaultProperties: Record<string, string>,
  description: string,
  anchorWeekStart: string,
): Promise<TaskRule> {
  return invoke<TaskRule>("create_task", {
    title,
    days,
    defaultProperties,
    description,
    anchorWeekStart,
  });
}

export async function updateTask(
  id: string,
  title: string,
  days: number[],
  defaultProperties: Record<string, string>,
  description: string,
  anchorWeekStart: string,
): Promise<TaskRule> {
  return invoke<TaskRule>("update_task", {
    id,
    title,
    days,
    defaultProperties,
    description,
    anchorWeekStart,
  });
}

export async function deleteTask(id: string): Promise<boolean> {
  return invoke<boolean>("delete_task", { id });
}

export async function toggleTaskComplete(id: string): Promise<TaskInstance> {
  return invoke<TaskInstance>("toggle_task_complete", { id });
}

export async function setTaskProperty(
  id: string,
  key: string,
  value: string,
): Promise<TaskInstance> {
  return invoke<TaskInstance>("set_task_property", { id, key, value });
}

export async function listPropertySchemas(): Promise<PropertySchema[]> {
  return invoke<PropertySchema[]>("list_property_schemas");
}

export async function createPropertySchema(
  name: string,
  options: NewPropertyOptionInput[],
): Promise<PropertySchema> {
  return invoke<PropertySchema>("create_property_schema", { name, options });
}

export async function deletePropertySchema(id: string): Promise<boolean> {
  return invoke<boolean>("delete_property_schema", { id });
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

export async function getPropertyDisplaySettings(): Promise<PropertyDisplaySettings> {
  return invoke<PropertyDisplaySettings>("get_property_display_settings");
}

export async function setPropertyDisplaySettings(
  hiddenSchemaIds: string[],
): Promise<PropertyDisplaySettings> {
  return invoke<PropertyDisplaySettings>("set_property_display_settings", {
    hiddenSchemaIds,
  });
}

export async function getThemeMode(): Promise<ThemeMode> {
  return invoke<ThemeMode>("get_theme_mode");
}

export async function setThemeMode(mode: ThemeMode): Promise<ThemeMode> {
  return invoke<ThemeMode>("set_theme_mode", { mode });
}
