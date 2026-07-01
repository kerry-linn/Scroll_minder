import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Lazily-initialised singleton so missing env vars surface as a clear error
// only when rate limiting is actually invoked (not at module load).
let _limiter: Ratelimit | null = null;

function getLimiter(): Ratelimit {
  if (_limiter) return _limiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing Upstash env vars: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set."
    );
  }

  const redis = new Redis({ url, token });

  // 10 task creations per 10 seconds, per authenticated user.
  _limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "10 s"),
    analytics: true,
    prefix: "scrollminder:task-create",
  });

  return _limiter;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

/**
 * Check whether a user is within the task-creation rate limit.
 * Returns `{ allowed: false }` with a retry hint when the limit is exceeded.
 * Throws if Upstash env vars are not configured.
 */
export async function checkTaskCreationLimit(
  userId: string
): Promise<RateLimitResult> {
  const limiter = getLimiter();
  const { success, reset } = await limiter.limit(userId);

  if (success) return { allowed: true };

  const retryAfterMs = Math.max(0, reset - Date.now());
  return { allowed: false, retryAfterMs };
}
