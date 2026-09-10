import "server-only";

/**
 * Fixed-window rate limiting for the login routes.
 *
 * Three things were wrong with the previous version (RQ-14):
 *
 *  1. it keyed on the *first* entry of `X-Forwarded-For`, which the client
 *     controls — rotating that header defeated the limiter entirely;
 *  2. the backing `Map` never evicted, so keys accumulated for the life of
 *     the process;
 *  3. it counted per IP only, so a slow spray from many addresses at one
 *     account was unthrottled.
 *
 * Still in-process, which is correct for a single instance and honest
 * about its limits. The store is behind the `RateLimitStore` interface
 * below so moving to Redis is a new implementation of two methods rather
 * than a rewrite of the auth routes.
 */

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type Window = { count: number; windowStart: number };

export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Window;
  reset(key: string): void;
}

/**
 * Process-local store. Sweeps expired windows on write — amortised, so
 * there is no timer to leak and no unbounded growth from an attacker
 * cycling keys.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, Window>();
  private lastSweep = 0;

  /** Long enough that a sweep is cheap, short enough that a burst of
   * distinct keys cannot sit in memory for long. */
  private static readonly SWEEP_INTERVAL_MS = 60_000;

  hit(key: string, windowMs: number, now: number): Window {
    this.sweep(now, windowMs);

    const existing = this.windows.get(key);
    if (!existing || now - existing.windowStart >= windowMs) {
      const fresh = { count: 1, windowStart: now };
      this.windows.set(key, fresh);
      return fresh;
    }

    existing.count += 1;
    return existing;
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  /** Test seam — asserting the map actually shrinks is the only way to
   * catch the leak coming back. */
  size(): number {
    return this.windows.size;
  }

  private sweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < MemoryRateLimitStore.SWEEP_INTERVAL_MS) return;
    this.lastSweep = now;

    for (const [key, window] of this.windows) {
      if (now - window.windowStart >= windowMs) {
        this.windows.delete(key);
      }
    }
  }
}

const defaultStore = new MemoryRateLimitStore();

export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  store: RateLimitStore = defaultStore,
  now: number = Date.now(),
): RateLimitResult {
  const windowMs = windowSeconds * 1000;
  const window = store.hit(key, windowMs, now);

  if (window.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((window.windowStart + windowMs - now) / 1000),
      ),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Clears a key's window — called after a successful sign-in so a user who
 * mistyped their password a few times isn't still counted against.
 */
export function clearRateLimit(
  key: string,
  store: RateLimitStore = defaultStore,
): void {
  store.reset(key);
}

/**
 * The client's address as seen through a trusted reverse proxy.
 *
 * `X-Forwarded-For` is a chain the client can prepend to at will: a
 * request arriving as `X-Forwarded-For: 1.2.3.4` reaches the app as
 * `1.2.3.4, <real client>` once the platform appends. Taking the *first*
 * entry therefore reads whatever the attacker wrote; taking the entry
 * `trustedProxyHops` from the right reads what the nearest trusted proxy
 * observed, which the client cannot forge.
 *
 * Railway (and most single-proxy PaaS) append exactly one hop, which is
 * the default. Set `TRUSTED_PROXY_HOPS` if a CDN adds another.
 */
export function clientIpFromHeaders(
  headerValue: string | null,
  trustedProxyHops = 1,
): string {
  if (!headerValue) return "unknown";

  const chain = headerValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (chain.length === 0) return "unknown";

  const index = chain.length - trustedProxyHops;
  return chain[Math.max(0, index)] ?? "unknown";
}
