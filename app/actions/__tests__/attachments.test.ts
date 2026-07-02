import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Suppress AWS SDK from requiring real credentials ──────────────────────────
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(),
  GetObjectCommand: vi.fn(),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.url/example"),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(supabaseMock),
}));

// Set required AWS env vars so createS3Client() doesn't return null
process.env.AWS_REGION = "us-east-1";
process.env.AWS_ACCESS_KEY_ID = "test-key";
process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
process.env.AWS_S3_BUCKET_NAME = "test-bucket";

const { getPresignedDownloadUrl } = await import(
  "../../../app/actions/attachments"
);

// ─────────────────────────────────────────────────────────────────────────────

const USER_ID = "user-abc";
const S3_KEY = `${USER_ID}/some-uuid-file.pdf`;

// Helper: mock the Supabase task row returned by the scan-status query.
function mockTaskScanRow(scanStatus: string | null) {
  supabaseMock.from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { attachment_scan_status: scanStatus },
      error: null,
    }),
  });
}

describe("getPresignedDownloadUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
    });
  });

  it("returns the signed URL for a clean owned key", async () => {
    mockTaskScanRow("clean");

    const result = await getPresignedDownloadUrl(S3_KEY);

    expect(result.success).toBe(true);
    if (result.success) expect(result.url).toBe("https://signed.url/example");
  });

  it("rejects a key belonging to a different user", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "other-user" } },
    });

    const result = await getPresignedDownloadUrl(S3_KEY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/access denied/i);
  });

  it("returns an error when the user is not authenticated", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });

    const result = await getPresignedDownloadUrl(S3_KEY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not authenticated/i);
  });

  it("blocks download when scan status is pending", async () => {
    mockTaskScanRow("pending");

    const result = await getPresignedDownloadUrl(S3_KEY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/scan/i);
  });

  it("blocks download when scan status is null (not yet scanned)", async () => {
    mockTaskScanRow(null);

    const result = await getPresignedDownloadUrl(S3_KEY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/scan/i);
  });

  it("blocks download when scan status is infected", async () => {
    mockTaskScanRow("infected");

    const result = await getPresignedDownloadUrl(S3_KEY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/malicious/i);
  });

  it("blocks download when scan status is error", async () => {
    mockTaskScanRow("error");

    const result = await getPresignedDownloadUrl(S3_KEY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/scan failed/i);
  });

  it("returns attachment-not-found when no task row matches", async () => {
    supabaseMock.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "not found" } }),
    });

    const result = await getPresignedDownloadUrl(S3_KEY);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/not found/i);
  });
});
