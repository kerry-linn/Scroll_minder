import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Env setup (must happen before module import) ──────────────────────────────
process.env.ATTACHMENT_SCAN_CALLBACK_SECRET = "test-secret-abc";

// ── Supabase admin mock ───────────────────────────────────────────────────────
const updateMock = vi.fn();
const eqMock = vi.fn();

const supabaseAdminMock = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn().mockReturnValue(supabaseAdminMock),
}));

// ── S3 delete mock ────────────────────────────────────────────────────────────
const deleteS3ObjectMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/app/actions/attachments", () => ({
  deleteS3Object: deleteS3ObjectMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// Import after mocks
const { POST } = await import("../route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, authHeader?: string): Request {
  return new Request("https://test.example/api/attachments/scan-callback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader !== undefined && { Authorization: authHeader }),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Build a chainable mock for:
 *   supabase.from("tasks").update({...}).eq(a, b).eq?(c, d)
 *
 * The route's query variable is awaited at the end, so the last thing in the
 * chain must be a real Promise. We model two cases:
 *   - no task_id: from().update().eq() → Promise
 *   - with task_id: from().update().eq().eq() → Promise
 *
 * We pass a Promise as the return value of the first .eq() but also attach
 * an extra .eq() method to it so the second call chains through.
 */
function setupDbUpdate(count: number, error: unknown = null) {
  const finalResult = { error, count };
  const finalPromise = Promise.resolve(finalResult);

  // Extend the promise with an .eq() method so it's chainable when task_id is provided.
  const chainablePromise = Object.assign(finalPromise, {
    eq: vi.fn().mockReturnValue(finalPromise),
  });

  updateMock.mockReturnValue({ eq: vi.fn().mockReturnValue(chainablePromise) });
  supabaseAdminMock.from.mockReturnValue({ update: updateMock });

  eqMock.mockReset();
}

// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/attachments/scan-callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteS3ObjectMock.mockResolvedValue(undefined);
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await POST(
      makeRequest({ s3_key: "u/k.pdf", verdict: "clean" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 for an incorrect bearer token", async () => {
    const res = await POST(
      makeRequest(
        { s3_key: "u/k.pdf", verdict: "clean" },
        "Bearer wrong-secret"
      )
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request(
      "https://test.example/api/attachments/scan-callback",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-secret-abc",
        },
        body: "not-json{{{",
      }
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when s3_key is missing", async () => {
    const res = await POST(
      makeRequest({ verdict: "clean" }, "Bearer test-secret-abc")
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when verdict is missing", async () => {
    const res = await POST(
      makeRequest({ s3_key: "u/k.pdf" }, "Bearer test-secret-abc")
    );
    expect(res.status).toBe(400);
  });

  it("updates the task and returns 200 for a clean verdict", async () => {
    setupDbUpdate(1);

    const res = await POST(
      makeRequest(
        { s3_key: "u/k.pdf", verdict: "NO_THREATS_FOUND" },
        "Bearer test-secret-abc"
      )
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("clean");
    expect(deleteS3ObjectMock).not.toHaveBeenCalled();
  });

  it("updates the task and deletes the S3 object for an infected verdict", async () => {
    setupDbUpdate(1);

    const res = await POST(
      makeRequest(
        {
          s3_key: "u/malware.exe",
          verdict: "THREATS_FOUND",
          reason: "Trojan.GenericKD",
        },
        "Bearer test-secret-abc"
      )
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("infected");
    expect(deleteS3ObjectMock).toHaveBeenCalledWith("u/malware.exe");
  });

  it("returns 404 when no task row matches the s3_key", async () => {
    setupDbUpdate(0);

    const res = await POST(
      makeRequest(
        { s3_key: "u/missing.pdf", verdict: "clean" },
        "Bearer test-secret-abc"
      )
    );

    expect(res.status).toBe(404);
  });

  it("returns 500 when the DB update fails", async () => {
    setupDbUpdate(0, { message: "connection refused" });

    const res = await POST(
      makeRequest(
        { s3_key: "u/k.pdf", verdict: "clean" },
        "Bearer test-secret-abc"
      )
    );

    expect(res.status).toBe(500);
  });

  it("accepts an optional task_id and still returns 200", async () => {
    setupDbUpdate(1);

    const res = await POST(
      makeRequest(
        {
          s3_key: "u/k.pdf",
          verdict: "NO_THREATS_FOUND",
          task_id: "task-uuid",
        },
        "Bearer test-secret-abc"
      )
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("clean");
  });
});
