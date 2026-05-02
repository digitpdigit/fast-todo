/** MIME types for HTML5 drag of task instances (WeekView + Today popover). */
export const TASK_INSTANCE_MIME = "application/x-fasttodo-instance";
export const TASK_FROM_DATE_MIME = "application/x-fasttodo-from-date";

/** `DataTransfer.types` entries are lowercase in Chromium; MIME is case-sensitive in `setData`. */
export function dataTransferHasTaskPayload(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  const want = TASK_INSTANCE_MIME.toLowerCase();
  return [...dt.types].some((t) => t.toLowerCase() === want);
}
