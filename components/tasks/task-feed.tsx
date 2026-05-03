"use client";

import { CheckIcon, Link2Icon, PaperclipIcon, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { getPresignedDownloadUrl } from "@/app/actions/attachments";
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

/** Duration the user must hold before the long-press completes (ms). */
const LONG_PRESS_MS = 600;

/**
 * Renders a small attachment chip below a task title.
 * - Manual URLs open directly in a new tab.
 * - Private S3 objects first obtain a short-lived signed GET URL via server action.
 */
function AttachmentLink({
  task,
}: {
  task: OptimisticTask;
}) {
  const [loading, setLoading] = React.useState(false);

  const label = task.attachment_name ?? "Attachment";
  const isS3 = Boolean(task.attachment_s3_key);
  const isUrl = Boolean(task.attachment_url);

  if (!isS3 && !isUrl) return null;

  async function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();

    if (isUrl && task.attachment_url) {
      window.open(task.attachment_url, "_blank", "noopener,noreferrer");
      return;
    }

    if (isS3 && task.attachment_s3_key) {
      if (task.isOptimistic) {
        toast.error("Wait for the task to finish saving before opening.");
        return;
      }
      setLoading(true);
      const result = await getPresignedDownloadUrl(task.attachment_s3_key);
      setLoading(false);
      if (result.success) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error(`Could not open file: ${result.error}`);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={loading}
      className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline disabled:opacity-50"
      aria-label={`Open attachment: ${label}`}
    >
      {isS3 ? (
        <PaperclipIcon className="size-3 shrink-0" />
      ) : (
        <Link2Icon className="size-3 shrink-0" />
      )}
      <span className="truncate max-w-[200px]">
        {loading ? "Opening…" : label}
      </span>
    </button>
  );
}

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
  const { removeTask, addOptimisticTask } = useTasksStore();
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pressing, setPressing] = React.useState(false);

  /**
   * Shared removal logic used by both the trash icon, the green check,
   * and the long-press gesture. Identical behavior per the spec.
   */
  async function removeWithRollback(label: string) {
    removeTask(task.id);

    if (!task.isOptimistic) {
      const result = await deleteTask(task.id);
      if (!result.success) {
        addOptimisticTask({ ...task, isOptimistic: false });
        toast.error(`${label} failed: ${result.error}`);
      }
    }
  }

  function handleDelete() {
    removeWithRollback("Couldn't delete task");
  }

  function handleComplete() {
    toast.success(`"${task.title}" marked as complete`);
    removeWithRollback("Couldn't complete task");
  }

  // Long-press handlers
  function startPress() {
    if (task.isOptimistic) return; // don't trigger on unconfirmed rows
    setPressing(true);
    longPressTimer.current = setTimeout(() => {
      setPressing(false);
      toast.success(`"${task.title}" marked as complete`);
      removeWithRollback("Couldn't complete task");
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setPressing(false);
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  return (
    <li
      className={cn(
        "group flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-all duration-150 select-none",
        task.isOptimistic && "opacity-60",
        pressing && "scale-[0.98] border-green-400 ring-2 ring-green-300/50"
      )}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {task.title}
        </span>
        <AttachmentLink task={task} />
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn("text-xs font-semibold", PRIORITY_COLOR[task.priority])}
        >
          {PRIORITY_LABEL[task.priority]}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Complete (green check) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleComplete();
            }}
            onPointerDown={(e) => e.stopPropagation()} // prevent long-press from firing too
            className="cursor-pointer text-muted-foreground/40 transition-colors hover:text-green-500"
            aria-label={`Complete "${task.title}"`}
          >
            <CheckIcon className="size-3" />
          </button>

          {/* Delete (red trash) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="cursor-pointer text-muted-foreground/40 transition-colors hover:text-destructive"
            aria-label={`Delete "${task.title}"`}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
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
