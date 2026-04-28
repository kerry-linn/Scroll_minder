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
}

export interface CreateTaskInput {
  title: string;
  due_date: string | null;
  priority: TaskPriority;
}

export interface OptimisticTask extends Task {
  /** true while the row has not yet been confirmed by Supabase */
  isOptimistic?: boolean;
}
