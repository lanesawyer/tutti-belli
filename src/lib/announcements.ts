import { db, eq, and, desc, Announcement, Ensemble, EnsembleMember, User } from '@db';
import { sendAnnouncementEmail } from './email';
import { postAnnouncementToDiscord } from './discord';
import { getEnsembleUrlId } from './slug';

// The ensemble's name, link, and Discord webhook come from the database rather than the form,
// so a form can't redirect the post to another webhook or mislabel the email.
async function getAnnouncementContext(ensembleId: string) {
  const ensemble = await db
    .select({ id: Ensemble.id, name: Ensemble.name, slug: Ensemble.slug, discordWebhookUrl: Ensemble.discordWebhookUrl })
    .from(Ensemble)
    .where(eq(Ensemble.id, ensembleId))
    .get();
  if (!ensemble) throw new Error('Ensemble not found.');
  return {
    ensembleName: ensemble.name,
    canonicalId: getEnsembleUrlId(ensemble),
    discordWebhookUrl: ensemble.discordWebhookUrl,
  };
}

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
  postToDiscord: boolean;
}) {
  const { ensembleId, title, content, createdBy, creatorName, postToDiscord } = params;
  const { ensembleName, canonicalId, discordWebhookUrl } = await getAnnouncementContext(ensembleId);

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
  creatorName: string;
  postToDiscord: boolean;
}) {
  const { announcementId, ensembleId, title, content, creatorName, postToDiscord } = params;
  const { ensembleName, discordWebhookUrl } = await getAnnouncementContext(ensembleId);

  await db
    .update(Announcement)
    .set({ title, content, updatedAt: new Date() })
    .where(and(eq(Announcement.id, announcementId), eq(Announcement.ensembleId, ensembleId)));

  if (postToDiscord && discordWebhookUrl) {
    postAnnouncementToDiscord(discordWebhookUrl, ensembleName, title, content, creatorName).catch(() => {});
  }
}

export async function deleteAnnouncement(announcementId: string) {
  await db.delete(Announcement).where(eq(Announcement.id, announcementId));
}
