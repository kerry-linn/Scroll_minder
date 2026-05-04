import {
  differenceInCalendarDays,
  isToday,
  isTomorrow,
  isYesterday,
} from "date-fns";

export function formatDaysRemaining(dueDateIso: string): string {
  const due = new Date(dueDateIso);
  const diff = differenceInCalendarDays(due, new Date());

  if (isToday(due)) return "today";
  if (isTomorrow(due)) return "tomorrow";
  if (isYesterday(due)) return "yesterday";
  if (diff > 0) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}
