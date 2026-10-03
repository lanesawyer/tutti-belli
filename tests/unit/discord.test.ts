import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDiscordWebhookUrl, postAnnouncementToDiscord } from '../../src/lib/discord.ts';

const WEBHOOK_URL = 'https://discord.com/api/webhooks/123/abc';

function makeArgs() {
  return [
    WEBHOOK_URL,
    'Chamber Orchestra',
    'Rehearsal Reminder',
    "Don't forget rehearsal is this Thursday at 7pm.",
    'Jane Smith',
  ] as const;
}

describe('isDiscordWebhookUrl', () => {
  it('accepts Discord webhook URLs', () => {
    expect(isDiscordWebhookUrl(WEBHOOK_URL)).toBe(true);
    expect(isDiscordWebhookUrl('https://discordapp.com/api/webhooks/123/a-b_C')).toBe(true);
    expect(isDiscordWebhookUrl('https://canary.discord.com/api/v10/webhooks/123/abc')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isDiscordWebhookUrl('')).toBe(false);
    expect(isDiscordWebhookUrl('not a url')).toBe(false);
    expect(isDiscordWebhookUrl('http://discord.com/api/webhooks/123/abc')).toBe(false);
    expect(isDiscordWebhookUrl('https://discord.com.example.com/api/webhooks/123/abc')).toBe(false);
    expect(isDiscordWebhookUrl('https://discord.com:8443/api/webhooks/123/abc')).toBe(false);
    expect(isDiscordWebhookUrl('https://user@discord.com/api/webhooks/123/abc')).toBe(false);
    expect(isDiscordWebhookUrl('https://discord.com/api/users/@me')).toBe(false);
    expect(isDiscordWebhookUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
  });
});

describe('postAnnouncementToDiscord', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('posts an embed to the webhook URL and returns success', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await postAnnouncementToDiscord(...makeArgs());

    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledOnce();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(init?.method).toBe('POST');

    const body = JSON.parse(init?.body as string);
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].title).toBe('Rehearsal Reminder');
    expect(body.embeds[0].description).toContain('Thursday');
    expect(body.embeds[0].footer.text).toContain('Chamber Orchestra');
    expect(body.embeds[0].footer.text).toContain('Jane Smith');
    expect(body.embeds[0].color).toBe(0x485fc7);
  });

  it('truncates content longer than 4096 characters', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const longContent = 'x'.repeat(5000);
    const result = await postAnnouncementToDiscord(
      WEBHOOK_URL,
      'Chamber Orchestra',
      'Long Post',
      longContent,
      'Jane Smith',
    );

    expect(result).toEqual({ success: true });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.embeds[0].description.length).toBeLessThanOrEqual(4096);
    expect(body.embeds[0].description.endsWith('...')).toBe(true);
  });

  it('returns failure when Discord returns a non-ok status', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Bad Request', { status: 400 }));

    const result = await postAnnouncementToDiscord(...makeArgs());

    expect(result.success).toBe(false);
    expect(result.error).toContain('400');
  });

  it('returns failure when fetch throws', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const result = await postAnnouncementToDiscord(...makeArgs());

    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('refuses to post to a URL that is not a Discord webhook', async () => {
    const result = await postAnnouncementToDiscord('https://example.com/hook', 'A', 'B', 'C', 'D');

    expect(result.success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('skips the fetch and returns success when DISCORD_DISABLED is set', async () => {
    vi.stubEnv('DISCORD_DISABLED', 'true');

    const result = await postAnnouncementToDiscord(...makeArgs());

    expect(result).toEqual({ success: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
