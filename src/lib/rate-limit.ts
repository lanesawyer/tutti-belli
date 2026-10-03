/**
 * Fixed-window counters kept in memory. Each Fly machine keeps its own counts and they reset
 * when a machine stops, which is fine for slowing down password guessing and email floods:
 * a sustained attack keeps the machine running.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Milliseconds until `key` may try again, or 0 if it is under the limit. */
  retryAfter(key: string, now = Date.now()): number {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) return 0;
    return entry.count >= this.limit ? entry.resetAt - now : 0;
  }

  record(key: string, now = Date.now()) {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count++;
    }
    if (this.hits.size > 10_000) this.prune(now);
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private prune(now: number) {
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}

const MINUTE = 60 * 1000;

// Failed sign-ins: per account, so one account can't be guessed at, and per client, so one
// client can't sweep many accounts.
export const failedLoginsByEmail = new RateLimiter(10, 15 * MINUTE);
export const failedLoginsByIp = new RateLimiter(50, 15 * MINUTE);

// Password-reset requests send email, so cap them per address and per client.
export const passwordResetsByEmail = new RateLimiter(3, 60 * MINUTE);
export const passwordResetsByIp = new RateLimiter(20, 60 * MINUTE);

/** The longest wait among the limiters, or 0 if every one allows the request. */
export function retryAfter(checks: [RateLimiter, string][], now = Date.now()): number {
  return Math.max(0, ...checks.map(([limiter, key]) => limiter.retryAfter(key, now)));
}

/**
 * The client's IP. Fly's proxy sets Fly-Client-IP itself, so it can't be spoofed the way the
 * first X-Forwarded-For entry can; elsewhere fall back to the socket address.
 */
export function clientIp(request: Request, fallback: string | undefined): string {
  return request.headers.get('fly-client-ip') ?? fallback ?? 'unknown';
}

export function tooManyAttemptsMessage(waitMs: number): string {
  const minutes = Math.max(1, Math.ceil(waitMs / MINUTE));
  return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}
