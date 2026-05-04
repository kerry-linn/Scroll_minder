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
  attachment_url: string | null;
  attachment_s3_key: string | null;
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
  isOptimistic?: boolean;
}
