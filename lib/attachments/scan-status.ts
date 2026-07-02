import type {
  OptimisticTask,
  TaskAttachmentScanStatus,
} from "@/lib/tasks/types";

// ── Callback payload ──────────────────────────────────────────────────────────

export interface ScanCallbackPayload {
  s3_key: string;
  verdict: string;
  task_id?: string;
  reason?: string;
}

export type ScanCallbackValidation =
  | { valid: true; payload: ScanCallbackPayload }
  | { valid: false; error: string };

export function validateScanCallbackPayload(
  body: unknown
): ScanCallbackValidation {
  if (typeof body !== "object" || body === null) {
    return { valid: false, error: "Request body must be a JSON object." };
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.s3_key !== "string" || obj.s3_key.trim() === "") {
    return { valid: false, error: "Missing or empty 's3_key'." };
  }

  if (typeof obj.verdict !== "string" || obj.verdict.trim() === "") {
    return { valid: false, error: "Missing or empty 'verdict'." };
  }

  if (obj.task_id !== undefined && typeof obj.task_id !== "string") {
    return { valid: false, error: "'task_id' must be a string when provided." };
  }

  if (obj.reason !== undefined && typeof obj.reason !== "string") {
    return { valid: false, error: "'reason' must be a string when provided." };
  }

  return {
    valid: true,
    payload: {
      s3_key: obj.s3_key as string,
      verdict: obj.verdict as string,
      task_id: obj.task_id as string | undefined,
      reason: obj.reason as string | undefined,
    },
  };
}

// ── Verdict mapping ───────────────────────────────────────────────────────────

// GuardDuty findings severity description strings are mapped here.
// Any verdict not matching "NO_THREATS_FOUND" is treated as infected if
// it looks like a positive finding, otherwise falls back to 'error'.
const CLEAN_VERDICTS = new Set([
  "NO_THREATS_FOUND",
  "clean",
  "no_threats_found",
]);

const INFECTED_VERDICTS = new Set([
  "THREATS_FOUND",
  "infected",
  "threats_found",
  "malware",
  "virus",
]);

export function verdictToScanStatus(verdict: string): TaskAttachmentScanStatus {
  const normalised = verdict.trim().toUpperCase();

  if (CLEAN_VERDICTS.has(normalised) || CLEAN_VERDICTS.has(verdict.trim())) {
    return "clean";
  }

  if (
    INFECTED_VERDICTS.has(normalised) ||
    INFECTED_VERDICTS.has(verdict.trim())
  ) {
    return "infected";
  }

  return "error";
}

// ── UI access guard ───────────────────────────────────────────────────────────

/**
 * Returns true when it is safe to open/download the attachment.
 * - External URL attachments (no s3_key) are always allowed.
 * - S3 attachments require scan_status === 'clean'.
 */
export function canOpenAttachment(task: OptimisticTask): boolean {
  if (!task.attachment_s3_key) {
    // URL-only attachment — not subject to scanning.
    return Boolean(task.attachment_url);
  }
  return task.attachment_scan_status === "clean";
}

/**
 * Returns a human-readable reason why the attachment cannot be opened,
 * or null when access is permitted.
 */
export function getAttachmentBlockReason(task: OptimisticTask): string | null {
  if (!task.attachment_s3_key) return null;

  switch (task.attachment_scan_status) {
    case null:
    case undefined:
    case "pending":
      return "This file is being scanned for malware. Please try again shortly.";
    case "infected":
      return "This file was flagged as malicious and cannot be opened.";
    case "error":
      return "Scan failed. Please delete the attachment and re-upload.";
    case "clean":
      return null;
  }
}
