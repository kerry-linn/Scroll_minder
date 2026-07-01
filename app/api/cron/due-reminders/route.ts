import * as Sentry from "@sentry/nextjs";
import { addDays, startOfDay } from "date-fns";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TaskPriority } from "@/lib/tasks/types";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY);

type ReminderType = "due_3d" | "due_5d";

interface PendingTask {
  id: string;
  user_id: string;
  title: string;
  due_date: string;
  priority: TaskPriority;
}

function buildWindowFilter(daysAhead: number): { gte: string; lt: string } {
  const targetDay = startOfDay(addDays(new Date(), daysAhead));
  const nextDay = addDays(targetDay, 1);
  return {
    gte: targetDay.toISOString(),
    lt: nextDay.toISOString(),
  };
}

function reminderTypeForPriority(priority: TaskPriority): ReminderType {
  return priority === "high" ? "due_5d" : "due_3d";
}

function daysAheadForPriority(priority: TaskPriority): number {
  return priority === "high" ? 5 : 3;
}

function formatDueDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

async function getUserEmail(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

export async function GET(request: Request) {
  const cronSecret = process.env.REMINDER_CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { error: "REMINDER_CRON_SECRET not configured." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (token !== cronSecret) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const fromEmail =
    process.env.REMINDER_FROM_EMAIL ?? "reminders@scrollminder.app";
  const supabase = createSupabaseAdminClient();

  const windows: { days: number; priorities: TaskPriority[] }[] = [
    { days: 3, priorities: ["low", "medium"] },
    { days: 5, priorities: ["high"] },
  ];

  let totalSent = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (const { days, priorities } of windows) {
    const { gte, lt } = buildWindowFilter(days);

    const { data: tasks, error: fetchError } = await supabase
      .from("tasks")
      .select("id, user_id, title, due_date, priority")
      .eq("status", "pending")
      .in("priority", priorities)
      .gte("due_date", gte)
      .lt("due_date", lt);

    if (fetchError) {
      Sentry.captureException(fetchError, {
        tags: { source: "cron:due-reminders", window: `${days}d` },
      });
      errors.push(
        `Failed to fetch tasks for ${days}d window: ${fetchError.message}`
      );
      continue;
    }

    if (!tasks || tasks.length === 0) continue;

    for (const task of tasks as PendingTask[]) {
      const reminderType = reminderTypeForPriority(task.priority);

      const { data: existing } = await supabase
        .from("task_email_reminders")
        .select("id")
        .eq("task_id", task.id)
        .eq("reminder_type", reminderType)
        .maybeSingle();

      if (existing) {
        totalSkipped++;
        continue;
      }

      const email = await getUserEmail(supabase, task.user_id);
      if (!email) {
        errors.push(
          `Could not resolve email for user ${task.user_id} (task ${task.id})`
        );
        continue;
      }

      const dueDays = daysAheadForPriority(task.priority);
      const formattedDate = formatDueDate(task.due_date);
      const priorityLabel =
        task.priority.charAt(0).toUpperCase() + task.priority.slice(1);

      const { error: sendError } = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `Reminder: "${task.title}" is due in ${dueDays} days`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
            <h2 style="font-size: 18px; margin-bottom: 4px;">Task due soon</h2>
            <p style="font-size: 15px; margin: 8px 0;">
              <strong>${task.title}</strong>
            </p>
            <p style="font-size: 14px; color: #555; margin: 4px 0;">
              Due: ${formattedDate}
            </p>
            <p style="font-size: 13px; color: #888; margin: 4px 0;">
              Priority: ${priorityLabel}
            </p>
            <p style="font-size: 13px; color: #999; margin-top: 24px;">
              — ScrollMinder
            </p>
          </div>
        `,
      });

      if (sendError) {
        Sentry.captureException(sendError, {
          tags: { source: "cron:due-reminders:resend" },
          extra: { taskId: task.id, userId: task.user_id },
        });
        errors.push(
          `Failed to send email for task ${task.id}: ${sendError.message}`
        );
        continue;
      }

      await supabase
        .from("task_email_reminders")
        .insert({ task_id: task.id, reminder_type: reminderType });

      totalSent++;
    }
  }

  return Response.json({
    ok: true,
    sent: totalSent,
    skipped: totalSkipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
