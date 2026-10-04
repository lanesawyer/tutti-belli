import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sent: { to: string; html: string }[] = [];
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (params: { to: string; html: string }) => {
        sent.push(params);
        return { error: null };
      },
    };
  },
}));

import { sendPasswordResetEmail, sendWelcomeEmail } from '../../src/lib/email.ts';

describe('email links', () => {
  beforeEach(() => {
    sent.length = 0;
    vi.stubEnv('EMAIL_DISABLED', '');
    vi.stubEnv('EMAIL_API_KEY', 'test-key');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('point at the site the request came from', async () => {
    await sendPasswordResetEmail('a@example.com', 'A', 'reset-token', 'https://tuttibelli.org');
    await sendWelcomeEmail('b@example.com', 'B', 'Choir', 'welcome-token', 'https://tutti-belli-pr-9.fly.dev');

    expect(sent[0].html).toContain('https://tuttibelli.org/reset-password?token=reset-token');
    expect(sent[1].html).toContain('https://tutti-belli-pr-9.fly.dev/reset-password?token=welcome-token');
    expect(sent.some((email) => email.html.includes('localhost'))).toBe(false);
  });
});
