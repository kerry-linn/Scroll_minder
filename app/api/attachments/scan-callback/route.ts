import * as Sentry from "@sentry/nextjs";
import { deleteS3Object } from "@/app/actions/attachments";
import {
  validateScanCallbackPayload,
  verdictToScanStatus,
} from "@/lib/attachments/scan-status";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const callbackSecret = process.env.ATTACHMENT_SCAN_CALLBACK_SECRET;
  if (!callbackSecret) {
    return Response.json(
      { error: "ATTACHMENT_SCAN_CALLBACK_SECRET not configured." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");

  if (token !== callbackSecret) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateScanCallbackPayload(body);
  if (!validation.valid) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const { s3_key, task_id, verdict, reason } = validation.payload;
  const scanStatus = verdictToScanStatus(verdict);
  const verdictAt = new Date().toISOString();

  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("tasks")
    .update({
      attachment_scan_status: scanStatus,
      attachment_scan_verdict_at: verdictAt,
      attachment_scan_reason: reason ?? null,
    })
    .eq("attachment_s3_key", s3_key);

  // When task_id is provided, narrow the update as an extra integrity check.
  if (task_id) {
    query = query.eq("id", task_id);
  }

  const { error: updateError, count } = await query;

  if (updateError) {
    Sentry.captureException(updateError, {
      tags: { source: "scan-callback" },
      extra: { s3_key, task_id, verdict },
    });
    return Response.json(
      { error: `DB update failed: ${updateError.message}` },
      { status: 500 }
    );
  }

  if (count === 0) {
    return Response.json(
      { error: "No matching task found for the provided s3_key." },
      { status: 404 }
    );
  }

  // Delete the S3 object when infected so storage isn't wasted and to prevent
  // accidental access via direct signed-URL generation. The task row audit
  // trail is preserved.
  if (scanStatus === "infected") {
    await deleteS3Object(s3_key);
  }

  return Response.json({ ok: true, status: scanStatus });
}
