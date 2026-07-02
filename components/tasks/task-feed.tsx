"use client";

import {
  AlertTriangleIcon,
  CheckIcon,
  Link2Icon,
  Loader2Icon,
  PaperclipIcon,
  ShieldOffIcon,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { getPresignedDownloadUrl } from "@/app/actions/attachments";
import { deleteTask } from "@/app/actions/tasks";
import {
  canOpenAttachment,
  getAttachmentBlockReason,
} from "@/lib/attachments/scan-status";
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

const LONG_PRESS_MS = 600;

function AttachmentLink({ task }: { task: OptimisticTask }) {
  const [loading, setLoading] = React.useState(false);

  const label = task.attachment_name ?? "Attachment";
  const isS3 = Boolean(task.attachment_s3_key);
  const isUrl = Boolean(task.attachment_url);

  if (!isS3 && !isUrl) return null;

  // ── Scan-status UI states (S3 only) ────────────────────────────────────────

  if (isS3) {
    const scanStatus = task.attachment_scan_status;

    if (task.isOptimistic || scanStatus === "pending" || scanStatus === null) {
      return (
        <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/60">
          <Loader2Icon className="size-3 shrink-0 animate-spin" />
          <span>Scanning…</span>
        </span>
      );
    }

    if (scanStatus === "infected") {
      return (
        <span className="mt-1 flex items-center gap-1 text-xs text-destructive/80">
          <ShieldOffIcon className="size-3 shrink-0" />
          <span>Blocked — file flagged as malicious</span>
        </span>
      );
    }

    if (scanStatus === "error") {
      return (
        <span className="mt-1 flex items-center gap-1 text-xs text-amber-500">
          <AlertTriangleIcon className="size-3 shrink-0" />
          <span>Scan failed — delete and re-upload</span>
        </span>
      );
    }
  }

  // ── Normal open flow (clean S3 or external URL) ────────────────────────────

  const blockReason = getAttachmentBlockReason(task);

  async function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();

    if (blockReason) {
      toast.error(blockReason);
      return;
    }

    if (!canOpenAttachment(task)) return;

    if (isUrl && task.attachment_url) {
      window.open(task.attachment_url, "_blank", "noopener,noreferrer");
      return;
    }

    if (isS3 && task.attachment_s3_key) {
      // Open a blank tab synchronously while the browser still trusts the
      // click gesture. Assigning its location after the await avoids the
      // async popup blocker in Chrome and Safari.
      const newTab = window.open("about:blank", "_blank");
      if (!newTab) {
        toast.error(
          "Pop-up blocked. Please allow pop-ups for this site and try again."
        );
        return;
      }

      setLoading(true);
      try {
        // Race against an 8-second timeout so the UI never stays stuck if the
        // server action hangs (e.g. cold-start crash with no HTTP response).
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Request timed out. Please try again.")),
            8_000
          )
        );
        const result = await Promise.race([
          getPresignedDownloadUrl(task.attachment_s3_key),
          timeout,
        ]);
        if (result.success) {
          newTab.location.href = result.url;
        } else {
          newTab.close();
          toast.error(`Could not open file: ${result.error}`);
        }
      } catch (err) {
        newTab.close();
        const msg =
          err instanceof Error ? err.message : "Something went wrong.";
        toast.error(`Could not open file: ${msg}`);
      } finally {
        setLoading(false);
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

function groupByDate(
  tasks: OptimisticTask[]
): { key: string; label: string; tasks: OptimisticTask[] }[] {
  const map = new Map<string, OptimisticTask[]>();

  for (const task of tasks) {
    const key = task.due_date ? task.due_date.slice(0, 10) : "no-date";
    const bucket = map.get(key) ?? [];
    bucket.push(task);
    map.set(key, bucket);
  }

  return Array.from(map.entries()).map(([key, tasks]) => {
    let label: string;
    if (key === "no-date") {
      label = "No date";
    } else {
      const date = new Date(`${key}T12:00:00`);
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
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [pressing, setPressing] = React.useState(false);

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

  function startPress() {
    if (task.isOptimistic) return;
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleComplete();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="cursor-pointer text-muted-foreground/40 transition-colors hover:text-green-500"
            aria-label={`Complete "${task.title}"`}
          >
            <CheckIcon className="size-3" />
          </button>

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
