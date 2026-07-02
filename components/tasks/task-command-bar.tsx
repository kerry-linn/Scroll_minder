"use client";

import { format } from "date-fns";
import {
  CalendarIcon,
  Link2Icon,
  PaperclipIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { getPresignedUploadUrl } from "@/app/actions/attachments";
import { createTask } from "@/app/actions/tasks";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDaysRemaining } from "@/lib/tasks/date-utils";
import type { TaskAttachmentScanStatus, TaskPriority } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";
import { useTasksStore } from "@/stores/tasks-store";

function generateTempId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function TaskCommandBar() {
  const [title, setTitle] = React.useState("");
  const [dueDate, setDueDate] = React.useState<Date | undefined>();
  const [priority, setPriority] = React.useState<TaskPriority>("low");
  const [calOpen, setCalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const [attachmentFile, setAttachmentFile] = React.useState<File | null>(null);
  const [attachmentUrl, setAttachmentUrl] = React.useState("");
  const [uploading, setUploading] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { addOptimisticTask, replaceOptimisticTask, removeTask } =
    useTasksStore();

  const daysLabel = dueDate ? formatDaysRemaining(dueDate.toISOString()) : null;

  const hasAttachment = attachmentFile !== null || attachmentUrl.trim() !== "";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      setAttachmentFile(file);
      setAttachmentUrl("");
    }
    e.target.value = "";
  }

  function clearAttachment() {
    setAttachmentFile(null);
    setAttachmentUrl("");
  }

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Please enter a task title.");
      return;
    }

    const tempId = generateTempId();
    const now = new Date().toISOString();
    const dueDateIso = dueDate ? dueDate.toISOString() : null;

    let attachS3Key: string | null = null;
    let attachUrl: string | null = null;
    let attachName: string | null = null;
    let attachScanStatus: TaskAttachmentScanStatus | null = null;

    if (attachmentFile) {
      setUploading(true);
      const result = await getPresignedUploadUrl(
        attachmentFile.name,
        attachmentFile.type,
        attachmentFile.size
      );
      setUploading(false);

      if (!result.success) {
        toast.error(`Upload failed: ${result.error}`);
        return;
      }

      try {
        const putRes = await fetch(result.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": attachmentFile.type },
          body: attachmentFile,
        });
        if (!putRes.ok) {
          toast.error("Upload to S3 failed. Please try again.");
          return;
        }
      } catch {
        toast.error("Upload to S3 failed. Please check your connection.");
        return;
      }

      attachS3Key = result.s3Key;
      attachName = attachmentFile.name;
      attachScanStatus = "pending";
    } else if (attachmentUrl.trim()) {
      attachUrl = attachmentUrl.trim();
      try {
        attachName = new URL(attachUrl).hostname;
      } catch {
        attachName = attachUrl;
      }
    }

    addOptimisticTask({
      id: tempId,
      user_id: "",
      title: trimmed,
      due_date: dueDateIso,
      priority,
      status: "pending",
      created_at: now,
      isOptimistic: true,
      attachment_url: attachUrl,
      attachment_s3_key: attachS3Key,
      attachment_name: attachName,
      attachment_scan_status: attachScanStatus,
      attachment_scan_verdict_at: null,
      attachment_scan_reason: null,
    });

    setTitle("");
    setDueDate(undefined);
    setPriority("low");
    clearAttachment();
    setSubmitting(true);

    const result = await createTask({
      title: trimmed,
      due_date: dueDateIso,
      priority,
      attachment_url: attachUrl,
      attachment_s3_key: attachS3Key,
      attachment_name: attachName,
    });
    // scan_status is derived server-side from whether an s3_key is present.

    setSubmitting(false);

    if (result.success) {
      replaceOptimisticTask(tempId, result.task);
    } else {
      removeTask(tempId);
      toast.error(`Failed to save task: ${result.error}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !submitting && !uploading) {
      handleSubmit();
    }
  }

  const busy = submitting || uploading;

  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-background px-4 py-3 shadow-[0_-2px_12px_0_rgba(0,0,0,0.06)]">
      <div className="mx-auto max-w-3xl space-y-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
          <Input
            placeholder="New task…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
            className="h-9 text-sm"
          />

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

          <Button
            size="sm"
            className="h-9 gap-1.5 px-3"
            onClick={handleSubmit}
            disabled={busy}
          >
            <PlusIcon className="size-3.5" />
            {uploading ? "Uploading…" : "Add"}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={[
              "image/*",
              "application/pdf",
              "text/plain",
              "text/csv",
              "application/zip",
              "application/msword",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "application/vnd.ms-excel",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ].join(",")}
            onChange={handleFileChange}
          />

          {hasAttachment ? (
            <div className="flex flex-1 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              {attachmentFile ? (
                <PaperclipIcon className="size-3 shrink-0" />
              ) : (
                <Link2Icon className="size-3 shrink-0" />
              )}
              <span className="truncate">
                {attachmentFile ? attachmentFile.name : attachmentUrl}
              </span>
              <button
                type="button"
                onClick={clearAttachment}
                className="ml-auto shrink-0 rounded p-0.5 hover:text-foreground"
                aria-label="Remove attachment"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ) : (
            <>
              <div className="relative flex flex-1 items-center">
                <Link2Icon className="absolute left-2.5 size-3.5 shrink-0 text-muted-foreground" />
                <Input
                  placeholder="Paste a link (optional)"
                  value={attachmentUrl}
                  onChange={(e) => {
                    setAttachmentUrl(e.target.value);
                    if (e.target.value) setAttachmentFile(null);
                  }}
                  disabled={busy}
                  className="h-8 pl-8 text-xs text-muted-foreground placeholder:text-muted-foreground/60"
                />
              </div>

              <span className="shrink-0 text-xs text-muted-foreground/50">
                or
              </span>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
                )}
              >
                <PaperclipIcon className="size-3.5" />
                Upload file
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
