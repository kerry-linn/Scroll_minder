import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDaysRemaining } from "../date-utils";

function isoFromNow(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

describe("formatDaysRemaining", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('returns "today" for a date that is today', () => {
    expect(formatDaysRemaining(isoFromNow(0))).toBe("today");
  });

  it('returns "tomorrow" for a date that is tomorrow', () => {
    expect(formatDaysRemaining(isoFromNow(1))).toBe("tomorrow");
  });

  it('returns "yesterday" for a date that was yesterday', () => {
    expect(formatDaysRemaining(isoFromNow(-1))).toBe("yesterday");
  });

  it('returns "in N days" for a future date', () => {
    expect(formatDaysRemaining(isoFromNow(5))).toBe("in 5 days");
  });

  it('returns "N days ago" for a past date', () => {
    expect(formatDaysRemaining(isoFromNow(-3))).toBe("3 days ago");
  });
});
