"use server";

import { getSupabaseServer } from "@/lib/supabase/server";
import type { CreateTaskInput, Task } from "@/lib/tasks/types";

export type CreateTaskResult =
  | { success: true; task: Task }
  | { success: false; error: string };

const CONFIG_ERROR =
  "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and an API key in .env.local.";

function getClient() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

export async function createTask(
  input: CreateTaskInput
): Promise<CreateTaskResult> {
  const client = getClient();
  if (!client) {
    return { success: false, error: CONFIG_ERROR };
  }

  const { data, error } = await client
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

export type DeleteTaskResult =
  | { success: true }
  | { success: false; error: string };

export async function deleteTask(id: string): Promise<DeleteTaskResult> {
  const client = getClient();
  if (!client) {
    return { success: false, error: CONFIG_ERROR };
  }

  const { error } = await client.from("tasks").delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function fetchPendingTasks(): Promise<Task[]> {
  const client = getClient();
  if (!client) return [];

  const { data, error } = await client
    .from("tasks")
    .select()
    .eq("status", "pending")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    return [];
  }

  return (data ?? []) as Task[];
}
