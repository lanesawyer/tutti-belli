import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Sent = { to: string; subject: string; html: string };
const sent: Sent[] = [];
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (params: Sent) => {
        sent.push(params);
        return { error: null };
      },
    };
    batch = {
      send: async (paramsList: Sent[]) => {
        sent.push(...paramsList);
        return { error: null };
      },
    };
  },
}));

import {
  escapeHtml,
  textToHtml,
  emailSubject,
  passwordSetUrl,
  sendAnnouncementEmail,
  sendEmailChangeVerificationEmail,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendAddedToEnsembleEmail,
} from '../../src/lib/email.ts';

const SITE = 'https://tuttibelli.org';
const EVIL = '<img src=x onerror=alert(1)>"\'&';
const EVIL_ESCAPED = '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;';

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

async function sendAll(name: string, ensembleName: string, title: string, content: string) {
  await sendPasswordResetEmail('a@example.com', name, 'reset-token');
  await sendEmailVerificationEmail('b@example.com', name, 'verify-token');
  await sendEmailChangeVerificationEmail('c@example.com', name, 'change-token');
  await sendWelcomeEmail('d@example.com', name, ensembleName, 'welcome-token');
  await sendAddedToEnsembleEmail('e@example.com', name, ensembleName, 'choir');
  await sendAnnouncementEmail([{ email: 'f@example.com', name }], ensembleName, 'choir', title, content, name);
}

describe('escapeHtml / textToHtml / emailSubject', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(EVIL)).toBe(EVIL_ESCAPED);
    expect(escapeHtml('plain text')).toBe('plain text');
  });

  it('keeps line breaks in plain text without allowing markup', () => {
    expect(textToHtml('Line 1\nLine <b>2</b>\r\n\r\nLine 3')).toBe('Line 1<br />Line &lt;b&gt;2&lt;/b&gt;<br /><br />Line 3');
  });

  it('turns header line breaks and control characters into spaces', () => {
    expect(emailSubject('Hi\r\nBcc: victim@example.com')).toBe('Hi Bcc: victim@example.com');
    expect(emailSubject('a b\u0000c\td')).toBe('a b c d');
  });
});

describe('email links', () => {
  beforeEach(() => {
    sent.length = 0;
    vi.stubEnv('EMAIL_DISABLED', '');
    vi.stubEnv('EMAIL_API_KEY', 'test-key');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('point at the configured site URL', async () => {
    vi.stubEnv('SITE_URL', SITE);
    await sendAll('A', 'Choir', 'Title', 'Body');

    expect(sent).toHaveLength(6);
    for (const email of sent) {
      const links = hrefs(email.html);
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) expect(link.startsWith(`${SITE}/`)).toBe(true);
    }
    expect(sent[0].html).toContain(`${SITE}/reset-password?token=reset-token`);
    expect(sent[3].html).toContain(`${SITE}/reset-password?token=welcome-token`);
    expect(sent[5].html).toContain(`${SITE}/ensembles/choir/announcements`);
  });

  it('follow SITE_URL for a preview', async () => {
    vi.stubEnv('SITE_URL', 'https://tutti-belli-pr-9.fly.dev');
    await sendPasswordResetEmail('a@example.com', 'A', 'reset-token');
    expect(hrefs(sent[0].html)).toEqual([
      'https://tutti-belli-pr-9.fly.dev/reset-password?token=reset-token',
      'https://tutti-belli-pr-9.fly.dev/reset-password?token=reset-token',
    ]);
  });

  it('use localhost in dev when SITE_URL is unset', async () => {
    vi.stubEnv('SITE_URL', '');
    await sendPasswordResetEmail('a@example.com', 'A', 'reset-token');
    expect(hrefs(sent[0].html)[0]).toBe('http://localhost:4321/reset-password?token=reset-token');
  });

  it('encode tokens and ensemble ids', async () => {
    vi.stubEnv('SITE_URL', SITE);
    await sendPasswordResetEmail('a@example.com', 'A', 'x"><script>&y=1');
    await sendAddedToEnsembleEmail('e@example.com', 'E', 'Choir', '../../x"y');
    for (const email of sent) {
      for (const link of hrefs(email.html)) expect(link.startsWith(`${SITE}/`)).toBe(true);
      expect(email.html).not.toContain('<script>');
    }
    expect(passwordSetUrl('t&u')).toBe(`${SITE}/reset-password?token=t%26u`);
  });
});

describe('email escaping', () => {
  beforeEach(() => {
    sent.length = 0;
    vi.stubEnv('EMAIL_DISABLED', '');
    vi.stubEnv('EMAIL_API_KEY', 'test-key');
    vi.stubEnv('SITE_URL', SITE);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('escapes names, ensemble names, titles and announcement content in every email', async () => {
    await sendAll(EVIL, EVIL, EVIL, `${EVIL}\nsecond line`);

    expect(sent).toHaveLength(6);
    for (const email of sent) {
      expect(email.html).not.toContain('<img');
      expect(email.html).toContain(EVIL_ESCAPED);
    }
    expect(sent[5].html).toContain(`${EVIL_ESCAPED}<br />second line`);
  });

  it('escapes the recipient address shown in the email-change message', async () => {
    await sendEmailChangeVerificationEmail('a<b>@example.com', 'A', 'token');
    expect(sent[0].html).toContain('a&lt;b&gt;@example.com');
  });

  it('strips line breaks from subjects built from user content', async () => {
    await sendWelcomeEmail('d@example.com', 'D', 'Choir\r\nBcc: x@example.com', 'token');
    await sendAnnouncementEmail([{ email: 'f@example.com', name: 'F' }], 'Choir', 'choir', 'Hi\nthere', 'Body', 'F');
    expect(sent[0].subject).toBe("You've been added to Choir Bcc: x@example.com");
    expect(sent[1].subject).toBe('[Choir] Hi there');
    for (const email of sent) expect(email.subject).not.toMatch(/[\r\n]/);
  });
});
