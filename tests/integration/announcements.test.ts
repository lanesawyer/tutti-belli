import { describe, it, expect, vi } from 'vitest';
import { db, Announcement, eq } from 'astro:db';
import {
  getEnsembleAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../../src/lib/announcements.ts';
import { createUser, createEnsemble, createMembership } from './fixtures.ts';

// Prevent real email/Discord calls
vi.mock('../../src/lib/email.ts', () => ({ sendAnnouncementEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../src/lib/discord.ts', () => ({ postAnnouncementToDiscord: vi.fn().mockResolvedValue(undefined) }));

describe('getEnsembleAnnouncements', () => {
  it('returns announcements for the ensemble in descending order', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const older = new Date('2024-01-01T00:00:00Z');
    const newer = new Date('2024-06-01T00:00:00Z');

    // Insert directly to control createdAt timestamps
    await db.insert(Announcement).values({
      id: crypto.randomUUID(),
      ensembleId: ensemble!.id,
      title: 'First',
      content: 'Old news',
      createdBy: admin!.id,
      createdAt: older,
      updatedAt: older,
    });
    await db.insert(Announcement).values({
      id: crypto.randomUUID(),
      ensembleId: ensemble!.id,
      title: 'Second',
      content: 'New news',
      createdBy: admin!.id,
      createdAt: newer,
      updatedAt: newer,
    });

    const results = await getEnsembleAnnouncements(ensemble!.id);
    expect(results).toHaveLength(2);
    // Most recent first
    expect(results[0].title).toBe('Second');
    expect(results[1].title).toBe('First');
  });

  it('returns empty array when ensemble has no announcements', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);

    const results = await getEnsembleAnnouncements(ensemble!.id);
    expect(results).toHaveLength(0);
  });

  it('does not return announcements from other ensembles', async () => {
    const admin = await createUser();
    const ensembleA = await createEnsemble(admin!.id, { name: 'Ensemble A' });
    const ensembleB = await createEnsemble(admin!.id, { name: 'Ensemble B' });

    await createAnnouncement({
      ensembleId: ensembleA!.id,
      title: 'Only for A',
      content: 'content',
      createdBy: admin!.id,
      creatorName: admin!.name,
      ensembleName: ensembleA!.name,
      canonicalId: ensembleA!.id,
      discordWebhookUrl: null,
      postToDiscord: false,
    });

    const results = await getEnsembleAnnouncements(ensembleB!.id);
    expect(results).toHaveLength(0);
  });

  it('includes the creator name from the User join', async () => {
    const admin = await createUser({ name: 'Jane Admin' });
    const ensemble = await createEnsemble(admin!.id);

    await createAnnouncement({
      ensembleId: ensemble!.id,
      title: 'With Creator',
      content: 'body',
      createdBy: admin!.id,
      creatorName: admin!.name,
      ensembleName: ensemble!.name,
      canonicalId: ensemble!.id,
      discordWebhookUrl: null,
      postToDiscord: false,
    });

    const [result] = await getEnsembleAnnouncements(ensemble!.id);
    expect(result.creatorName).toBe('Jane Admin');
  });
});

describe('createAnnouncement', () => {
  it('inserts an Announcement row', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);

    await createAnnouncement({
      ensembleId: ensemble!.id,
      title: 'Hello World',
      content: 'Test content',
      createdBy: admin!.id,
      creatorName: admin!.name,
      ensembleName: ensemble!.name,
      canonicalId: ensemble!.id,
      discordWebhookUrl: null,
      postToDiscord: false,
    });

    const rows = await db
      .select()
      .from(Announcement)
      .where(eq(Announcement.ensembleId, ensemble!.id))
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Hello World');
    expect(rows[0].content).toBe('Test content');
    expect(rows[0].createdBy).toBe(admin!.id);
  });

  it('fires Discord webhook when postToDiscord is true and webhook URL is set', async () => {
    const { postAnnouncementToDiscord } = await import('../../src/lib/discord.ts');
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);

    await createAnnouncement({
      ensembleId: ensemble!.id,
      title: 'Discord Post',
      content: 'body',
      createdBy: admin!.id,
      creatorName: admin!.name,
      ensembleName: ensemble!.name,
      canonicalId: ensemble!.id,
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/fake',
      postToDiscord: true,
    });

    // Give the fire-and-forget promise a tick to resolve
    await new Promise((r) => setTimeout(r, 0));
    expect(postAnnouncementToDiscord).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/123/fake',
      ensemble!.name,
      'Discord Post',
      'body',
      admin!.name,
    );
  });

  it('does not fire Discord webhook when postToDiscord is false', async () => {
    const { postAnnouncementToDiscord } = await import('../../src/lib/discord.ts');
    vi.mocked(postAnnouncementToDiscord).mockClear();
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);

    await createAnnouncement({
      ensembleId: ensemble!.id,
      title: 'No Discord',
      content: 'body',
      createdBy: admin!.id,
      creatorName: admin!.name,
      ensembleName: ensemble!.name,
      canonicalId: ensemble!.id,
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/fake',
      postToDiscord: false,
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(postAnnouncementToDiscord).not.toHaveBeenCalled();
  });
});

describe('updateAnnouncement', () => {
  it('updates title and content', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);

    await createAnnouncement({
      ensembleId: ensemble!.id,
      title: 'Original Title',
      content: 'Original body',
      createdBy: admin!.id,
      creatorName: admin!.name,
      ensembleName: ensemble!.name,
      canonicalId: ensemble!.id,
      discordWebhookUrl: null,
      postToDiscord: false,
    });

    const [row] = await db
      .select()
      .from(Announcement)
      .where(eq(Announcement.ensembleId, ensemble!.id))
      .all();

    await updateAnnouncement({
      announcementId: row.id,
      ensembleId: ensemble!.id,
      title: 'Updated Title',
      content: 'Updated body',
      ensembleName: ensemble!.name,
      creatorName: admin!.name,
      discordWebhookUrl: null,
      postToDiscord: false,
    });

    const updated = await db.select().from(Announcement).where(eq(Announcement.id, row.id)).get();
    expect(updated!.title).toBe('Updated Title');
    expect(updated!.content).toBe('Updated body');
  });

  it('sets updatedAt to a time >= createdAt', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);

    await createAnnouncement({
      ensembleId: ensemble!.id,
      title: 'Timestamp Test',
      content: 'body',
      createdBy: admin!.id,
      creatorName: admin!.name,
      ensembleName: ensemble!.name,
      canonicalId: ensemble!.id,
      discordWebhookUrl: null,
      postToDiscord: false,
    });

    const [row] = await db
      .select()
      .from(Announcement)
      .where(eq(Announcement.ensembleId, ensemble!.id))
      .all();

    await updateAnnouncement({
      announcementId: row.id,
      ensembleId: ensemble!.id,
      title: 'New Title',
      content: 'body',
      ensembleName: ensemble!.name,
      creatorName: admin!.name,
      discordWebhookUrl: null,
      postToDiscord: false,
    });

    const updated = await db.select().from(Announcement).where(eq(Announcement.id, row.id)).get();
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(updated!.createdAt.getTime());
  });
});

describe('deleteAnnouncement', () => {
  it('removes the announcement row', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);

    await createAnnouncement({
      ensembleId: ensemble!.id,
      title: 'To Delete',
      content: 'body',
      createdBy: admin!.id,
      creatorName: admin!.name,
      ensembleName: ensemble!.name,
      canonicalId: ensemble!.id,
      discordWebhookUrl: null,
      postToDiscord: false,
    });

    const [row] = await db
      .select()
      .from(Announcement)
      .where(eq(Announcement.ensembleId, ensemble!.id))
      .all();

    await deleteAnnouncement(row.id);

    const after = await db.select().from(Announcement).where(eq(Announcement.id, row.id)).get();
    expect(after).toBeUndefined();
  });

  it('does not delete other announcements in the same ensemble', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);

    await createAnnouncement({
      ensembleId: ensemble!.id,
      title: 'Keep Me',
      content: 'body',
      createdBy: admin!.id,
      creatorName: admin!.name,
      ensembleName: ensemble!.name,
      canonicalId: ensemble!.id,
      discordWebhookUrl: null,
      postToDiscord: false,
    });
    await createAnnouncement({
      ensembleId: ensemble!.id,
      title: 'Delete Me',
      content: 'body',
      createdBy: admin!.id,
      creatorName: admin!.name,
      ensembleName: ensemble!.name,
      canonicalId: ensemble!.id,
      discordWebhookUrl: null,
      postToDiscord: false,
    });

    const rows = await db
      .select()
      .from(Announcement)
      .where(eq(Announcement.ensembleId, ensemble!.id))
      .all();

    const toDelete = rows.find((r) => r.title === 'Delete Me')!;
    await deleteAnnouncement(toDelete.id);

    const remaining = await db
      .select()
      .from(Announcement)
      .where(eq(Announcement.ensembleId, ensemble!.id))
      .all();

    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe('Keep Me');
  });
});
