export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "pending" | "completed";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  /** Manually pasted external link. */
  attachment_url: string | null;
  /** S3 object key for private uploads (use to generate signed GET URLs). */
  attachment_s3_key: string | null;
  /** Human-readable label shown under the task title. */
  attachment_name: string | null;
}

export interface CreateTaskInput {
  title: string;
  due_date: string | null;
  priority: TaskPriority;
  attachment_url?: string | null;
  attachment_s3_key?: string | null;
  attachment_name?: string | null;
}

export interface OptimisticTask extends Task {
  /** true while the row has not yet been confirmed by Supabase */
  isOptimistic?: boolean;
}
