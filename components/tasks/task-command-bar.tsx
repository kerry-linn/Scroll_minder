"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useTasksStore } from "@/stores/tasks-store";
import { createTask } from "@/app/actions/tasks";
import type { TaskPriority } from "@/lib/tasks/types";
import { formatDaysRemaining } from "@/lib/tasks/date-utils";
import { cn } from "@/lib/utils";

function generateTempId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TaskCommandBar() {
  const [title, setTitle] = React.useState("");
  const [dueDate, setDueDate] = React.useState<Date | undefined>();
  const [priority, setPriority] = React.useState<TaskPriority>("low");
  const [calOpen, setCalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const { addOptimisticTask, replaceOptimisticTask, removeTask } =
    useTasksStore();

  const daysLabel = dueDate ? formatDaysRemaining(dueDate.toISOString()) : null;

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Please enter a task title.");
      return;
    }

    const tempId = generateTempId();
    const now = new Date().toISOString();
    const dueDateIso = dueDate ? dueDate.toISOString() : null;

    addOptimisticTask({
      id: tempId,
      title: trimmed,
      due_date: dueDateIso,
      priority,
      status: "pending",
      created_at: now,
      isOptimistic: true,
    });

    setTitle("");
    setDueDate(undefined);
    setPriority("low");
    setSubmitting(true);

    const result = await createTask({
      title: trimmed,
      due_date: dueDateIso,
      priority,
    });

    setSubmitting(false);

    if (result.success) {
      replaceOptimisticTask(tempId, result.task);
    } else {
      removeTask(tempId);
      toast.error(`Failed to save task: ${result.error}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !submitting) {
      handleSubmit();
    }
  }

  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-background px-4 py-3 shadow-[0_-2px_12px_0_rgba(0,0,0,0.06)]">
      <div className="mx-auto grid max-w-3xl grid-cols-[1fr_auto_auto_auto] items-center gap-2">
        {/* Column 1: Title input */}
        <Input
          placeholder="New task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={submitting}
          className="h-9 text-sm"
        />

        {/* Column 2: Date picker */}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 w-auto gap-1.5 px-3 text-sm",
              !dueDate && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="size-3.5 shrink-0" />
            {dueDate ? (
              <span>
                {format(dueDate, "MMM d")}{" "}
                <span className="text-muted-foreground">· {daysLabel}</span>
              </span>
            ) : (
              <span>Due date</span>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={dueDate}
              onSelect={(d) => {
                setDueDate(d);
                setCalOpen(false);
              }}
              captionLayout="label"
            />
          </PopoverContent>
        </Popover>

        {/* Column 3: Priority selector */}
        <Select
          value={priority}
          onValueChange={(v) => setPriority(v as TaskPriority)}
        >
          <SelectTrigger className="h-9 w-24 text-sm">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        {/* Column 4: Submit */}
        <Button
          size="sm"
          className="h-9 gap-1.5 px-3"
          onClick={handleSubmit}
          disabled={submitting}
        >
          <PlusIcon className="size-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}
