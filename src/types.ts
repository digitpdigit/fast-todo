export type ThemeMode = "system" | "light" | "dark";

export type TaskRule = {
  id: string;
  title: string;
  daysOfWeek: number[];
  description: string;
  anchorWeekStart: string;
  createdAt: string;
  color: string;
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
  color: string;
};

export type ReminderSettings = {
  enabled: boolean;
  time: string;
};
