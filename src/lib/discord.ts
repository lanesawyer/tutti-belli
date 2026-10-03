function getEnv(key: string, fallback = ''): string {
  return process.env[key] || fallback;
}

export interface DiscordResult {
  success: boolean;
  error?: string;
}

const WEBHOOK_HOSTS = new Set(['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com']);

/** Whether `value` is a Discord webhook URL, the only place the server will post announcements. */
export function isDiscordWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    WEBHOOK_HOSTS.has(url.hostname) &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    /^\/api\/(v\d+\/)?webhooks\/\d+\/[\w-]+\/?$/.test(url.pathname)
  );
}

export async function postAnnouncementToDiscord(
  webhookUrl: string,
  ensembleName: string,
  announcementTitle: string,
  announcementContent: string,
  authorName: string,
): Promise<DiscordResult> {
  if (getEnv('DISCORD_DISABLED')) {
    console.log(`[discord] disabled — skipping announcement post "${announcementTitle}"`);
    return { success: true };
  }

  if (!isDiscordWebhookUrl(webhookUrl)) {
    console.error('[discord] refusing to post to a URL that is not a Discord webhook');
    return { success: false, error: 'Not a Discord webhook URL' };
  }

  const description =
    announcementContent.length > 4096
      ? announcementContent.slice(0, 4093) + '...'
      : announcementContent;

  const payload = {
    embeds: [
      {
        title: announcementTitle,
        description,
        color: 0x485fc7,
        footer: { text: `${ensembleName} · ${authorName}` },
      },
    ],
  };

  console.log(`[discord] posting announcement "${announcementTitle}" to webhook`);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'error',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[discord] webhook returned ${res.status}: ${body}`);
      return { success: false, error: `Discord returned ${res.status}` };
    }
    return { success: true };
  } catch (error) {
    console.error('[discord] failed to post announcement:', error);
    return { success: false, error: String(error) };
  }
}
