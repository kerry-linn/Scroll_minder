import {
  differenceInCalendarDays,
  format,
  isToday,
  isTomorrow,
  isYesterday,
} from "date-fns";

/**
 * Returns a human-readable label for a due date relative to today.
 * Examples: "today", "tomorrow", "in 3 days", "yesterday", "3 days ago"
 */
export function formatDaysRemaining(dueDateIso: string): string {
  const due = new Date(dueDateIso);
  const diff = differenceInCalendarDays(due, new Date());

  if (isToday(due)) return "today";
  if (isTomorrow(due)) return "tomorrow";
  if (isYesterday(due)) return "yesterday";
  if (diff > 0) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/**
 * Formats a due date as a compact locale string for display (e.g. "Apr 30").
 */
export function formatDueDate(dueDateIso: string): string {
  return format(new Date(dueDateIso), "MMM d");
}
