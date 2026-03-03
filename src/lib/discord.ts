function getEnv(key: string, fallback = ''): string {
  return import.meta.env[key] || process.env[key] || fallback;
}

export interface DiscordResult {
  success: boolean;
  error?: string;
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
