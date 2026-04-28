"use client";

import { useTasksStore } from "@/stores/tasks-store";
import type { OptimisticTask, TaskPriority } from "@/lib/tasks/types";
import { formatDueDate, formatDaysRemaining } from "@/lib/tasks/date-utils";
import { cn } from "@/lib/utils";

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

function TaskCard({ task }: { task: OptimisticTask }) {
  return (
    <li
      className={cn(
        "flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-opacity",
        task.isOptimistic && "opacity-60"
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-medium text-foreground">
          {task.title}
        </span>
        {task.due_date && (
          <span className="text-xs text-muted-foreground">
            {formatDueDate(task.due_date)}{" "}
            <span className="font-medium text-foreground/70">
              · {formatDaysRemaining(task.due_date)}
            </span>
          </span>
        )}
      </div>
      <span
        className={cn(
          "shrink-0 text-xs font-semibold",
          PRIORITY_COLOR[task.priority]
        )}
      >
        {PRIORITY_LABEL[task.priority]}
      </span>
    </li>
  );
}

export function TaskFeed() {
  const tasks = useTasksStore((s) => s.tasks);

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
        <span className="text-4xl select-none">📭</span>
        <p className="text-sm">No pending tasks. Add one below.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 px-4 pb-4 pt-2">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
    </ul>
  );
}
