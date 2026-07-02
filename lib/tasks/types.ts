import type { TaskRow } from "@/lib/supabase/database.types";

// Re-export generated DB enum types so callers don't need to reach into database.types directly.
export type {
  TaskAttachmentScanStatus,
  TaskPriority,
  TaskStatus,
} from "@/lib/supabase/database.types";

// The full database row shape for a task, sourced from generated types.
export type Task = TaskRow;

// Input shape for creating a task (omits server-generated fields).
export interface CreateTaskInput {
  title: string;
  due_date: string | null;
  priority: Task["priority"];
  attachment_url?: string | null;
  attachment_s3_key?: string | null;
  attachment_name?: string | null;
}

// UI-level overlay for optimistic inserts before the server round-trip returns.
export interface OptimisticTask extends Task {
  isOptimistic?: boolean;
}
