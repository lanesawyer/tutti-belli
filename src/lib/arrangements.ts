import { db, eq, and, desc, alias, Arrangement, ArrangementReviewer, ArrangementMessage, User, Song, SongFile } from 'astro:db';
import { uploadArrangementFile, validateArrangementFile, deleteStorageFile } from './storage';

export type ArrangementStatus = 'submitted' | 'in_review' | 'needs_revision' | 'approved' | 'rejected';

export const ARRANGEMENT_STATUS_LABELS: Record<ArrangementStatus, string> = {
  submitted: 'Submitted',
  in_review: 'In Review',
  needs_revision: 'Needs Revision',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const ARRANGEMENT_STATUS_COLORS: Record<ArrangementStatus, 'info' | 'warning' | 'danger' | 'success'> = {
  submitted: 'info',
  in_review: 'warning',
  needs_revision: 'danger',
  approved: 'success',
  rejected: 'danger',
};

function fileCategory(file: File): 'sheet_music' | 'rehearsal_track' {
  return file.type.startsWith('audio/') || file.name.toLowerCase().endsWith('.mp3')
    ? 'rehearsal_track'
    : 'sheet_music';
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getEnsembleArrangements(ensembleId: string) {
  const Submitter = alias(User, 'submitter');
  return db
    .select({
      id: Arrangement.id,
      songId: Arrangement.songId,
      name: Song.name,
      composer: Song.composer,
      arranger: Song.arranger,
      status: Arrangement.status,
      createdAt: Arrangement.createdAt,
      updatedAt: Arrangement.updatedAt,
      submitterName: Submitter.name,
      submittedBy: Arrangement.submittedBy,
    })
    .from(Arrangement)
    .innerJoin(Song, eq(Arrangement.songId, Song.id))
    .innerJoin(Submitter, eq(Arrangement.submittedBy, Submitter.id))
    .where(eq(Arrangement.ensembleId, ensembleId))
    .orderBy(desc(Arrangement.createdAt))
    .all();
}

export async function getMemberArrangements(ensembleId: string, userId: string) {
  return db
    .select({
      id: Arrangement.id,
      songId: Arrangement.songId,
      name: Song.name,
      composer: Song.composer,
      arranger: Song.arranger,
      status: Arrangement.status,
      createdAt: Arrangement.createdAt,
      updatedAt: Arrangement.updatedAt,
    })
    .from(Arrangement)
    .innerJoin(Song, eq(Arrangement.songId, Song.id))
    .where(and(eq(Arrangement.ensembleId, ensembleId), eq(Arrangement.submittedBy, userId)))
    .orderBy(desc(Arrangement.createdAt))
    .all();
}

export async function getArrangement(arrangementId: string) {
  const Submitter = alias(User, 'submitter');
  return db
    .select({
      id: Arrangement.id,
      ensembleId: Arrangement.ensembleId,
      songId: Arrangement.songId,
      submittedBy: Arrangement.submittedBy,
      name: Song.name,
      composer: Song.composer,
      arranger: Song.arranger,
      description: Arrangement.description,
      status: Arrangement.status,
      createdAt: Arrangement.createdAt,
      updatedAt: Arrangement.updatedAt,
      submitterName: Submitter.name,
    })
    .from(Arrangement)
    .innerJoin(Song, eq(Arrangement.songId, Song.id))
    .innerJoin(Submitter, eq(Arrangement.submittedBy, Submitter.id))
    .where(eq(Arrangement.id, arrangementId))
    .get() ?? null;
}

export async function getArrangementReviewers(arrangementId: string) {
  return db
    .select({ userId: ArrangementReviewer.userId, name: User.name })
    .from(ArrangementReviewer)
    .innerJoin(User, eq(ArrangementReviewer.userId, User.id))
    .where(eq(ArrangementReviewer.arrangementId, arrangementId))
    .orderBy(ArrangementReviewer.addedAt)
    .all();
}

export async function addArrangementReviewer(arrangementId: string, userId: string) {
  const existing = await db
    .select()
    .from(ArrangementReviewer)
    .where(and(eq(ArrangementReviewer.arrangementId, arrangementId), eq(ArrangementReviewer.userId, userId)))
    .get();
  if (!existing) {
    await db.insert(ArrangementReviewer).values({ id: crypto.randomUUID(), arrangementId, userId });
  }
}

export async function getArrangementFiles(songId: string) {
  return db
    .select({
      id: SongFile.id,
      name: SongFile.name,
      url: SongFile.url,
      category: SongFile.category,
      uploadedAt: SongFile.uploadedAt,
      uploaderName: User.name,
    })
    .from(SongFile)
    .innerJoin(User, eq(SongFile.uploadedBy, User.id))
    .where(eq(SongFile.songId, songId))
    .orderBy(SongFile.uploadedAt)
    .all();
}

export async function getArrangementMessages(arrangementId: string) {
  return db
    .select({
      id: ArrangementMessage.id,
      content: ArrangementMessage.content,
      createdAt: ArrangementMessage.createdAt,
      userId: ArrangementMessage.userId,
      authorName: User.name,
    })
    .from(ArrangementMessage)
    .innerJoin(User, eq(ArrangementMessage.userId, User.id))
    .where(eq(ArrangementMessage.arrangementId, arrangementId))
    .orderBy(ArrangementMessage.createdAt)
    .all();
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface CreateArrangementInput {
  ensembleId: string;
  submittedBy: string;
  name: string;
  composer?: string;
  arranger?: string;
  description?: string;
}

export async function createArrangement(
  input: CreateArrangementInput,
  file: File,
): Promise<{ id: string; error?: string }> {
  const validation = validateArrangementFile(file);
  if (!validation.valid) return { id: '', error: validation.error };

  const url = await uploadArrangementFile(file, input.ensembleId);

  const songId = crypto.randomUUID();
  await db.insert(Song).values({
    id: songId,
    ensembleId: input.ensembleId,
    name: input.name.trim(),
    composer: input.composer?.trim() || null,
    arranger: input.arranger?.trim() || null,
  });

  const arrangementId = crypto.randomUUID();
  await db.insert(Arrangement).values({
    id: arrangementId,
    ensembleId: input.ensembleId,
    songId,
    submittedBy: input.submittedBy,
    description: input.description?.trim() || null,
    status: 'submitted',
  });

  await db.insert(SongFile).values({
    id: crypto.randomUUID(),
    songId,
    name: file.name,
    url,
    category: fileCategory(file),
    uploadedBy: input.submittedBy,
  });

  return { id: arrangementId };
}

export async function updateArrangementStatus(arrangementId: string, status: ArrangementStatus) {
  await db
    .update(Arrangement)
    .set({ status, updatedAt: new Date() })
    .where(eq(Arrangement.id, arrangementId));
}

export async function addArrangementMessage(
  arrangementId: string,
  userId: string,
  content: string,
) {
  await db.insert(ArrangementMessage).values({
    id: crypto.randomUUID(),
    arrangementId,
    userId,
    content: content.trim(),
  });
}

export async function addArrangementRevision(
  arrangementId: string,
  file: File,
  ensembleId: string,
  uploadedBy: string,
): Promise<{ error?: string }> {
  const validation = validateArrangementFile(file);
  if (!validation.valid) return { error: validation.error };

  const arrangement = await db
    .select({ songId: Arrangement.songId })
    .from(Arrangement)
    .where(eq(Arrangement.id, arrangementId))
    .get();
  if (!arrangement) return { error: 'Arrangement not found.' };

  const url = await uploadArrangementFile(file, ensembleId);

  await db.insert(SongFile).values({
    id: crypto.randomUUID(),
    songId: arrangement.songId,
    name: file.name,
    url,
    category: fileCategory(file),
    uploadedBy,
  });

  await db
    .update(Arrangement)
    .set({ status: 'submitted', updatedAt: new Date() })
    .where(eq(Arrangement.id, arrangementId));

  return {};
}

export async function deleteArrangementFile(fileId: string) {
  const file = await db.select().from(SongFile).where(eq(SongFile.id, fileId)).get();
  if (file) {
    await deleteStorageFile(file.url);
    await db.delete(SongFile).where(eq(SongFile.id, fileId));
  }
}
