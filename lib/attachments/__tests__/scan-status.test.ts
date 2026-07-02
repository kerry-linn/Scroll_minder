import { describe, expect, it } from "vitest";
import type { OptimisticTask } from "@/lib/tasks/types";
import {
  canOpenAttachment,
  getAttachmentBlockReason,
  validateScanCallbackPayload,
  verdictToScanStatus,
} from "../scan-status";

// ── verdictToScanStatus ───────────────────────────────────────────────────────

describe("verdictToScanStatus", () => {
  it("maps NO_THREATS_FOUND to clean", () => {
    expect(verdictToScanStatus("NO_THREATS_FOUND")).toBe("clean");
  });

  it("maps clean (lowercase) to clean", () => {
    expect(verdictToScanStatus("clean")).toBe("clean");
  });

  it("maps THREATS_FOUND to infected", () => {
    expect(verdictToScanStatus("THREATS_FOUND")).toBe("infected");
  });

  it("maps infected (lowercase) to infected", () => {
    expect(verdictToScanStatus("infected")).toBe("infected");
  });

  it("maps an unknown verdict to error", () => {
    expect(verdictToScanStatus("UNSUPPORTED_VALUE")).toBe("error");
  });
});

// ── validateScanCallbackPayload ───────────────────────────────────────────────

describe("validateScanCallbackPayload", () => {
  it("accepts a minimal valid payload", () => {
    const result = validateScanCallbackPayload({
      s3_key: "user/uuid-file.pdf",
      verdict: "NO_THREATS_FOUND",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.s3_key).toBe("user/uuid-file.pdf");
      expect(result.payload.verdict).toBe("NO_THREATS_FOUND");
    }
  });

  it("accepts a full payload with optional fields", () => {
    const result = validateScanCallbackPayload({
      s3_key: "user/uuid-file.pdf",
      verdict: "THREATS_FOUND",
      task_id: "task-uuid",
      reason: "Trojan.GenericKD",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects non-object body", () => {
    const result = validateScanCallbackPayload("bad");
    expect(result.valid).toBe(false);
  });

  it("rejects missing s3_key", () => {
    const result = validateScanCallbackPayload({ verdict: "clean" });
    expect(result.valid).toBe(false);
  });

  it("rejects empty s3_key", () => {
    const result = validateScanCallbackPayload({
      s3_key: "  ",
      verdict: "clean",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects missing verdict", () => {
    const result = validateScanCallbackPayload({ s3_key: "user/file.pdf" });
    expect(result.valid).toBe(false);
  });

  it("rejects non-string task_id", () => {
    const result = validateScanCallbackPayload({
      s3_key: "user/file.pdf",
      verdict: "clean",
      task_id: 123,
    });
    expect(result.valid).toBe(false);
  });
});

// ── canOpenAttachment / getAttachmentBlockReason ──────────────────────────────

function makeTask(overrides: Partial<OptimisticTask>): OptimisticTask {
  return {
    id: "t1",
    user_id: "u1",
    title: "Task",
    due_date: null,
    priority: "low",
    status: "pending",
    created_at: new Date().toISOString(),
    attachment_url: null,
    attachment_s3_key: null,
    attachment_name: null,
    attachment_scan_status: null,
    attachment_scan_verdict_at: null,
    attachment_scan_reason: null,
    ...overrides,
  } as OptimisticTask;
}

describe("canOpenAttachment", () => {
  it("allows a clean S3 attachment", () => {
    const task = makeTask({
      attachment_s3_key: "user/uuid.pdf",
      attachment_scan_status: "clean",
    });
    expect(canOpenAttachment(task)).toBe(true);
  });

  it("blocks a pending S3 attachment", () => {
    const task = makeTask({
      attachment_s3_key: "user/uuid.pdf",
      attachment_scan_status: "pending",
    });
    expect(canOpenAttachment(task)).toBe(false);
  });

  it("blocks an infected S3 attachment", () => {
    const task = makeTask({
      attachment_s3_key: "user/uuid.pdf",
      attachment_scan_status: "infected",
    });
    expect(canOpenAttachment(task)).toBe(false);
  });

  it("blocks an errored S3 attachment", () => {
    const task = makeTask({
      attachment_s3_key: "user/uuid.pdf",
      attachment_scan_status: "error",
    });
    expect(canOpenAttachment(task)).toBe(false);
  });

  it("allows a URL attachment (no S3 key)", () => {
    const task = makeTask({ attachment_url: "https://example.com" });
    expect(canOpenAttachment(task)).toBe(true);
  });
});

describe("getAttachmentBlockReason", () => {
  it("returns null for a clean attachment", () => {
    const task = makeTask({
      attachment_s3_key: "user/uuid.pdf",
      attachment_scan_status: "clean",
    });
    expect(getAttachmentBlockReason(task)).toBeNull();
  });

  it("returns null for a URL attachment", () => {
    const task = makeTask({ attachment_url: "https://example.com" });
    expect(getAttachmentBlockReason(task)).toBeNull();
  });

  it("returns a scanning message for pending", () => {
    const task = makeTask({
      attachment_s3_key: "user/uuid.pdf",
      attachment_scan_status: "pending",
    });
    expect(getAttachmentBlockReason(task)).toMatch(/scan/i);
  });

  it("returns an infected message", () => {
    const task = makeTask({
      attachment_s3_key: "user/uuid.pdf",
      attachment_scan_status: "infected",
    });
    expect(getAttachmentBlockReason(task)).toMatch(/malicious/i);
  });

  it("returns an error message", () => {
    const task = makeTask({
      attachment_s3_key: "user/uuid.pdf",
      attachment_scan_status: "error",
    });
    expect(getAttachmentBlockReason(task)).toMatch(/scan failed/i);
  });
});
