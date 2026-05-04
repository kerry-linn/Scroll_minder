"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CreateTaskInput, Task } from "@/lib/tasks/types";
import { deleteS3Object } from "./attachments";

export type CreateTaskResult =
  | { success: true; task: Task }
  | { success: false; error: string };

export type DeleteTaskResult =
  | { success: true }
  | { success: false; error: string };

export async function createTask(
  input: CreateTaskInput
): Promise<CreateTaskResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Session expired. Please sign in again." };
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title: input.title,
      due_date: input.due_date,
      priority: input.priority,
      status: "pending",
      attachment_url: input.attachment_url ?? null,
      attachment_s3_key: input.attachment_s3_key ?? null,
      attachment_name: input.attachment_name ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Unknown error inserting task.",
    };
  }

  return { success: true, task: data as Task };
}

export async function deleteTask(id: string): Promise<DeleteTaskResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Session expired. Please sign in again." };
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("attachment_s3_key")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  if (task?.attachment_s3_key) {
    await deleteS3Object(task.attachment_s3_key);
  }

  return { success: true };
}

export async function fetchPendingTasks(): Promise<Task[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("tasks")
    .select()
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    return [];
  }

  return (data ?? []) as Task[];
}
