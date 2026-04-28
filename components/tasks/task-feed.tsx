"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTask } from "@/app/actions/tasks";
import { formatDaysRemaining } from "@/lib/tasks/date-utils";
import type { OptimisticTask, TaskPriority } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";
import { useTasksStore } from "@/stores/tasks-store";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "High",
  medium: "Med",
  low: "Low",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-muted-foreground",
};

/** Group tasks by their ISO date string (YYYY-MM-DD) or "no-date". */
function groupByDate(
  tasks: OptimisticTask[]
): { key: string; label: string; tasks: OptimisticTask[] }[] {
  const map = new Map<string, OptimisticTask[]>();

  for (const task of tasks) {
    const key = task.due_date
      ? task.due_date.slice(0, 10) // "YYYY-MM-DD"
      : "no-date";
    const bucket = map.get(key) ?? [];
    bucket.push(task);
    map.set(key, bucket);
  }

  return Array.from(map.entries()).map(([key, tasks]) => {
    let label: string;
    if (key === "no-date") {
      label = "No date";
    } else {
      const date = new Date(`${key}T12:00:00`); // noon avoids TZ shifts
      label = date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
    return { key, label, tasks };
  });
}

function TaskCard({ task }: { task: OptimisticTask }) {
  const removeTask = useTasksStore((s) => s.removeTask);

  async function handleDelete() {
    removeTask(task.id);

    if (!task.isOptimistic) {
      const result = await deleteTask(task.id);
      if (!result.success) {
        toast.error(`Delete failed: ${result.error}`);
        // No re-add here — keep it gone optimistically to avoid flicker;
        // a hard refresh will restore it if truly not deleted.
      }
    }
  }

  return (
    <li
      className={cn(
        "flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-opacity",
        task.isOptimistic && "opacity-60"
      )}
    >
      <span className="truncate text-sm font-medium text-foreground">
        {task.title}
      </span>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn("text-xs font-semibold", PRIORITY_COLOR[task.priority])}
        >
          {PRIORITY_LABEL[task.priority]}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          className="text-muted-foreground/40 transition-colors hover:text-destructive"
          aria-label={`Delete "${task.title}"`}
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </li>
  );
}

export function TaskFeed() {
  const tasks = useTasksStore((s) => s.tasks);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
        <p className="text-sm">No pending tasks.</p>
      </div>
    );
  }

  const groups = groupByDate(tasks);

  return (
    <div className="flex flex-col gap-6 px-4 pb-4 pt-4">
      {groups.map(({ key, label, tasks: groupTasks }) => {
        const daysLabel =
          key !== "no-date" ? formatDaysRemaining(`${key}T12:00:00`) : null;

        return (
          <section key={key}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground/60">
                {label}
              </span>
              {daysLabel && (
                <span className="text-xs text-muted-foreground">
                  {daysLabel}
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-1.5">
              {groupTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
