import { db, eq, and, desc, Announcement, EnsembleMember, User } from 'astro:db';
import { sendAnnouncementEmail } from './email';
import { postAnnouncementToDiscord } from './discord';

export async function getEnsembleAnnouncements(ensembleId: string) {
  return await db
    .select({
      id: Announcement.id,
      title: Announcement.title,
      content: Announcement.content,
      createdAt: Announcement.createdAt,
      updatedAt: Announcement.updatedAt,
      creatorName: User.name,
    })
    .from(Announcement)
    .innerJoin(User, eq(Announcement.createdBy, User.id))
    .where(eq(Announcement.ensembleId, ensembleId))
    .orderBy(desc(Announcement.createdAt))
    .all();
}

export async function createAnnouncement(params: {
  ensembleId: string;
  title: string;
  content: string;
  createdBy: string;
  creatorName: string;
  ensembleName: string;
  canonicalId: string;
  discordWebhookUrl: string | null;
  postToDiscord: boolean;
}) {
  const { ensembleId, title, content, createdBy, creatorName, ensembleName, canonicalId, discordWebhookUrl, postToDiscord } = params;

  await db.insert(Announcement).values({
    id: crypto.randomUUID(),
    ensembleId,
    title,
    content,
    createdBy,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const members = await db
    .select({ email: User.email, name: User.name })
    .from(EnsembleMember)
    .innerJoin(User, eq(EnsembleMember.userId, User.id))
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.status, 'active')))
    .all();

  sendAnnouncementEmail(members, ensembleName, canonicalId, title, content, creatorName).catch(() => {});

  if (postToDiscord && discordWebhookUrl) {
    postAnnouncementToDiscord(discordWebhookUrl, ensembleName, title, content, creatorName).catch(() => {});
  }
}

export async function updateAnnouncement(params: {
  announcementId: string;
  ensembleId: string;
  title: string;
  content: string;
  ensembleName: string;
  creatorName: string;
  discordWebhookUrl: string | null;
  postToDiscord: boolean;
}) {
  const { announcementId, title, content, ensembleName, creatorName, discordWebhookUrl, postToDiscord } = params;

  await db
    .update(Announcement)
    .set({ title, content, updatedAt: new Date() })
    .where(eq(Announcement.id, announcementId));

  if (postToDiscord && discordWebhookUrl) {
    postAnnouncementToDiscord(discordWebhookUrl, ensembleName, title, content, creatorName).catch(() => {});
  }
}

export async function deleteAnnouncement(announcementId: string) {
  await db.delete(Announcement).where(eq(Announcement.id, announcementId));
}
