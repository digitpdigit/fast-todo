export type ThemeMode = "system" | "light" | "dark";

export type TaskRule = {
  id: string;
  title: string;
  daysOfWeek: number[];
  defaultProperties: Record<string, string>;
  description: string;
  anchorWeekStart: string;
  createdAt: string;
};

export type TaskInstance = {
  id: string;
  templateId: string;
  templateTitle: string;
  templateDescription: string;
  templateDaysOfWeek: number[];
  anchorWeekStart: string;
  date: string;
  completed: boolean;
  properties: Record<string, string>;
};

export type PropertyOption = {
  id: string;
  schemaId: string;
  value: string;
  label: string;
  color: string;
};

export type PropertySchema = {
  id: string;
  name: string;
  type: string;
  options: PropertyOption[];
};

export type NewPropertyOptionInput = {
  value: string;
  label: string;
  color: string;
};

export type ReminderSettings = {
  enabled: boolean;
  time: string;
};

export type PropertyDisplaySettings = {
  hiddenSchemaIds: string[];
};
