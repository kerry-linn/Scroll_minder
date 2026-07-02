import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock next/headers so `cookies()` doesn't blow up outside Next.js runtime ──
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}));

// ── Shared mutable Supabase stub ──────────────────────────────────────────────
const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue(supabaseMock),
}));

// Must import after mocks are in place
const { createTask, deleteTask } = await import("../../../app/actions/tasks");

// ─────────────────────────────────────────────────────────────────────────────

describe("createTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when the user is not authenticated", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });

    const result = await createTask({
      title: "My task",
      due_date: null,
      priority: "low",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/session expired/i);
  });

  it("returns the created task on success", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const fakeTask = {
      id: "task-1",
      user_id: "user-1",
      title: "My task",
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
    };

    supabaseMock.from.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: fakeTask, error: null }),
    });

    const result = await createTask({
      title: "My task",
      due_date: null,
      priority: "low",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.task.title).toBe("My task");
  });

  it("inserts attachment_scan_status=pending when an s3 key is provided", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const insertMock = vi.fn().mockReturnThis();
    const fakeTask = {
      id: "task-2",
      user_id: "user-1",
      title: "File task",
      due_date: null,
      priority: "low",
      status: "pending",
      created_at: new Date().toISOString(),
      attachment_url: null,
      attachment_s3_key: "user-1/uuid-file.pdf",
      attachment_name: "file.pdf",
      attachment_scan_status: "pending",
      attachment_scan_verdict_at: null,
      attachment_scan_reason: null,
    };

    supabaseMock.from.mockReturnValue({
      insert: insertMock,
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: fakeTask, error: null }),
    });

    await createTask({
      title: "File task",
      due_date: null,
      priority: "low",
      attachment_s3_key: "user-1/uuid-file.pdf",
      attachment_name: "file.pdf",
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ attachment_scan_status: "pending" })
    );
  });

  it("inserts attachment_scan_status=null for URL-only attachments", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const insertMock = vi.fn().mockReturnThis();
    const fakeTask = {
      id: "task-3",
      user_id: "user-1",
      title: "Link task",
      due_date: null,
      priority: "low",
      status: "pending",
      created_at: new Date().toISOString(),
      attachment_url: "https://example.com",
      attachment_s3_key: null,
      attachment_name: "example.com",
      attachment_scan_status: null,
      attachment_scan_verdict_at: null,
      attachment_scan_reason: null,
    };

    supabaseMock.from.mockReturnValue({
      insert: insertMock,
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: fakeTask, error: null }),
    });

    await createTask({
      title: "Link task",
      due_date: null,
      priority: "low",
      attachment_url: "https://example.com",
      attachment_name: "example.com",
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ attachment_scan_status: null })
    );
  });

  it("returns an error when the DB insert fails", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    supabaseMock.from.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "DB error" },
      }),
    });

    const result = await createTask({
      title: "My task",
      due_date: null,
      priority: "low",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("DB error");
  });
});

describe("deleteTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error when the user is not authenticated", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });

    const result = await deleteTask("task-1");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/session expired/i);
  });

  it("returns success when the task is deleted", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });

    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { attachment_s3_key: null } }),
    };

    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    // Second .eq() resolves to the final result
    let eqCallCount = 0;
    deleteChain.eq.mockImplementation(() => {
      eqCallCount++;
      if (eqCallCount >= 2) {
        return Promise.resolve({ error: null });
      }
      return deleteChain;
    });

    supabaseMock.from
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(deleteChain);

    const result = await deleteTask("task-1");

    expect(result.success).toBe(true);
  });
});
