"use server";

import { getSupabaseServer } from "@/lib/supabase/server";
import type { CreateTaskInput, Task } from "@/lib/tasks/types";

export type CreateTaskResult =
  | { success: true; task: Task }
  | { success: false; error: string };

export async function createTask(
  input: CreateTaskInput
): Promise<CreateTaskResult> {
  let supabase;
  try {
    supabase = getSupabaseServer();
  } catch {
    return {
      success: false,
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and an API key in .env.local (see README or .env.example).",
    };
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      due_date: input.due_date,
      priority: input.priority,
      status: "pending",
    })
    .select()
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Unknown error inserting task",
    };
  }

  return { success: true, task: data as Task };
}

export async function fetchPendingTasks(): Promise<Task[]> {
  let supabase;
  try {
    supabase = getSupabaseServer();
  } catch (e) {
    console.error(
      "fetchPendingTasks: Supabase not configured or client init failed:",
      e
    );
    return [];
  }

  const { data, error } = await supabase
    .from("tasks")
    .select()
    .eq("status", "pending")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch tasks:", error.message);
    return [];
  }

  return (data ?? []) as Task[];
}
