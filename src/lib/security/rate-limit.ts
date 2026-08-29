import "server-only";

/**
 * Simple in-memory, per-process, per-key sliding window — same tradeoff the
 * legacy backend documented for its own rate limiter (fine for a single
 * instance at this MVP's scale; revisit if this ever runs multi-instance).
 */
const attempts = new Map<string, { count: number; windowStart: number }>();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const existing = attempts.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    attempts.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.ceil(
      (existing.windowStart + windowMs - now) / 1000,
    );
    return { allowed: false, retryAfterSeconds };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
