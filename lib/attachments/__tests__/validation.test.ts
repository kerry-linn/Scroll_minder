import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  validateS3KeyOwnership,
  validateUpload,
} from "../validation";

describe("validateUpload", () => {
  it("accepts a valid MIME type within the size limit", () => {
    const result = validateUpload("image/jpeg", 1024);
    expect(result.valid).toBe(true);
  });

  it("rejects a disallowed MIME type", () => {
    const result = validateUpload("application/x-executable", 1024);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/not allowed/i);
  });

  it("rejects a file that exceeds the 20 MB limit", () => {
    const result = validateUpload("image/png", MAX_UPLOAD_BYTES + 1);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/too large/i);
  });

  it("accepts a file exactly at the limit", () => {
    const result = validateUpload("application/pdf", MAX_UPLOAD_BYTES);
    expect(result.valid).toBe(true);
  });

  it("accepts every explicitly allowed MIME type", () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      const result = validateUpload(mime, 1024);
      expect(result.valid, `expected ${mime} to be allowed`).toBe(true);
    }
  });
});

describe("validateS3KeyOwnership", () => {
  const userId = "user-abc-123";

  it("accepts a key that starts with the user's ID", () => {
    const result = validateS3KeyOwnership(`${userId}/some-file.pdf`, userId);
    expect(result.valid).toBe(true);
  });

  it("rejects a key belonging to a different user", () => {
    const result = validateS3KeyOwnership("other-user/some-file.pdf", userId);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/access denied/i);
  });

  it("rejects a key with no user prefix", () => {
    const result = validateS3KeyOwnership("some-file.pdf", userId);
    expect(result.valid).toBe(false);
  });

  it("rejects an empty key", () => {
    const result = validateS3KeyOwnership("", userId);
    expect(result.valid).toBe(false);
  });
});
