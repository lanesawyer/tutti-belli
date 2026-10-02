import { describe, it, expect } from 'vitest';
import { RateLimiter, retryAfter, clientIp, tooManyAttemptsMessage } from '../../src/lib/rate-limit.ts';

const MINUTE = 60_000;

describe('RateLimiter', () => {
  it('allows requests until the limit, then blocks until the window ends', () => {
    const limiter = new RateLimiter(3, 10 * MINUTE);
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(limiter.retryAfter('a', t0)).toBe(0);
      limiter.record('a', t0);
    }
    expect(limiter.retryAfter('a', t0 + MINUTE)).toBe(9 * MINUTE);
    expect(limiter.retryAfter('a', t0 + 10 * MINUTE)).toBe(0);
  });

  it('starts a fresh window after the old one expires', () => {
    const limiter = new RateLimiter(2, MINUTE);
    limiter.record('a', 0);
    limiter.record('a', 0);
    expect(limiter.retryAfter('a', 1)).toBeGreaterThan(0);
    limiter.record('a', MINUTE + 1);
    expect(limiter.retryAfter('a', MINUTE + 2)).toBe(0);
  });

  it('tracks keys separately and can reset one', () => {
    const limiter = new RateLimiter(1, MINUTE);
    limiter.record('a', 0);
    expect(limiter.retryAfter('a', 1)).toBeGreaterThan(0);
    expect(limiter.retryAfter('b', 1)).toBe(0);
    limiter.reset('a');
    expect(limiter.retryAfter('a', 1)).toBe(0);
  });
});

describe('retryAfter', () => {
  it('returns the longest wait across limiters', () => {
    const short = new RateLimiter(1, MINUTE);
    const long = new RateLimiter(1, 5 * MINUTE);
    short.record('x', 0);
    long.record('y', 0);
    expect(retryAfter([[short, 'x'], [long, 'y']], 0)).toBe(5 * MINUTE);
    expect(retryAfter([[short, 'other'], [long, 'other']], 0)).toBe(0);
  });
});

describe('clientIp', () => {
  it("prefers Fly's client IP header over the socket address", () => {
    const request = new Request('https://tuttibelli.org/', { headers: { 'fly-client-ip': '203.0.113.7', 'x-forwarded-for': '6.6.6.6' } });
    expect(clientIp(request, '10.0.0.1')).toBe('203.0.113.7');
  });

  it('falls back to the socket address', () => {
    expect(clientIp(new Request('http://localhost/'), '127.0.0.1')).toBe('127.0.0.1');
    expect(clientIp(new Request('http://localhost/'), undefined)).toBe('unknown');
  });
});

describe('tooManyAttemptsMessage', () => {
  it('rounds the wait up to whole minutes', () => {
    expect(tooManyAttemptsMessage(30_000)).toBe('Too many attempts. Please try again in 1 minute.');
    expect(tooManyAttemptsMessage(9 * MINUTE + 1)).toBe('Too many attempts. Please try again in 10 minutes.');
  });
});
