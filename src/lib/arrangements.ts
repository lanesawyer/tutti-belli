import {
  db,
  eq,
  and,
  desc,
  asc,
  inArray,
  Arrangement,
  ArrangementVersion,
  ArrangementComment,
  Ensemble,
  EnsembleMember,
  Group,
  GroupMembership,
  Song,
  SongFile,
  User,
} from '@db';
import { uploadArrangementFile, validateSongFile } from './storage';

// ─── Access ─────────────────────────────────────────────────────────────────

/**
 * Whether the user belongs to the ensemble's assigned arrangement review group
 * (e.g. the "Artistic Guild"). Ensemble/site admins are handled separately.
 */
export async function isArrangementReviewer(ensembleId: string, userId: string): Promise<boolean> {
  const ensemble = await db
    .select({ groupId: Ensemble.arrangementReviewGroupId })
    .from(Ensemble)
    .where(eq(Ensemble.id, ensembleId))
    .get();

  if (!ensemble?.groupId) return false;

  const membership = await db
    .select({ id: GroupMembership.id })
    .from(GroupMembership)
    .where(and(eq(GroupMembership.groupId, ensemble.groupId), eq(GroupMembership.userId, userId)))
    .get();

  return !!membership;
}

/**
 * Resolve a version's file for download, enforcing visibility: the submitter,
 * ensemble admins, site admins, and review-group members may download.
 */
export async function getArrangementFileWithAccess(
  versionId: string,
  user: { id: string; role: string }
) {
  const row = await db
    .select({
      url: ArrangementVersion.url,
      fileName: ArrangementVersion.fileName,
      ensembleId: Arrangement.ensembleId,
      submittedBy: Arrangement.submittedBy,
    })
    .from(ArrangementVersion)
    .innerJoin(Arrangement, eq(ArrangementVersion.arrangementId, Arrangement.id))
    .where(eq(ArrangementVersion.id, versionId))
    .get();

  if (!row) return null;

  if (user.role !== 'admin' && row.submittedBy !== user.id) {
    const membership = await db
      .select()
      .from(EnsembleMember)
      .where(and(eq(EnsembleMember.ensembleId, row.ensembleId), eq(EnsembleMember.userId, user.id)))
      .get();
    const isEnsembleAdmin = membership?.role === 'admin';
    if (!isEnsembleAdmin) {
      if (!membership || !(await isArrangementReviewer(row.ensembleId, user.id))) return null;
    }
  }

  return { url: row.url, name: row.fileName };
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getEnsembleArrangements(
  ensembleId: string,
  userId: string,
  canSeeAll: boolean
) {
  const baseFilter = eq(Arrangement.ensembleId, ensembleId);
  const arrangements = await db
    .select({
      id: Arrangement.id,
      title: Arrangement.title,
      composer: Arrangement.composer,
      arranger: Arrangement.arranger,
      status: Arrangement.status,
      submittedBy: Arrangement.submittedBy,
      submitterName: User.name,
      createdAt: Arrangement.createdAt,
    })
    .from(Arrangement)
    .innerJoin(User, eq(Arrangement.submittedBy, User.id))
    .where(canSeeAll ? baseFilter : and(baseFilter, eq(Arrangement.submittedBy, userId)))
    .orderBy(desc(Arrangement.createdAt))
    .all();

  const versionCounts = new Map<string, number>();
  if (arrangements.length > 0) {
    const versions = await db
      .select({ arrangementId: ArrangementVersion.arrangementId })
      .from(ArrangementVersion)
      .where(inArray(ArrangementVersion.arrangementId, arrangements.map((a) => a.id)))
      .all();
    for (const v of versions) {
      versionCounts.set(v.arrangementId, (versionCounts.get(v.arrangementId) ?? 0) + 1);
    }
  }

  return { arrangements, versionCounts };
}

export async function getArrangementDetail(arrangementId: string) {
  const arrangement = await db
    .select({
      id: Arrangement.id,
      ensembleId: Arrangement.ensembleId,
      title: Arrangement.title,
      composer: Arrangement.composer,
      arranger: Arrangement.arranger,
      notes: Arrangement.notes,
      status: Arrangement.status,
      submittedBy: Arrangement.submittedBy,
      approvedSongId: Arrangement.approvedSongId,
      createdAt: Arrangement.createdAt,
      submitterName: User.name,
    })
    .from(Arrangement)
    .innerJoin(User, eq(Arrangement.submittedBy, User.id))
    .where(eq(Arrangement.id, arrangementId))
    .get();

  if (!arrangement) return { arrangement: null, versions: [], comments: [] };

  const [versions, comments] = await Promise.all([
    db
      .select({
        id: ArrangementVersion.id,
        versionNumber: ArrangementVersion.versionNumber,
        fileName: ArrangementVersion.fileName,
        notes: ArrangementVersion.notes,
        uploadedAt: ArrangementVersion.uploadedAt,
        uploaderName: User.name,
      })
      .from(ArrangementVersion)
      .innerJoin(User, eq(ArrangementVersion.uploadedBy, User.id))
      .where(eq(ArrangementVersion.arrangementId, arrangementId))
      .orderBy(desc(ArrangementVersion.versionNumber))
      .all(),
    db
      .select({
        id: ArrangementComment.id,
        versionId: ArrangementComment.versionId,
        versionNumber: ArrangementVersion.versionNumber,
        content: ArrangementComment.content,
        createdAt: ArrangementComment.createdAt,
        authorName: User.name,
        authorId: ArrangementComment.userId,
      })
      .from(ArrangementComment)
      .innerJoin(ArrangementVersion, eq(ArrangementComment.versionId, ArrangementVersion.id))
      .innerJoin(User, eq(ArrangementComment.userId, User.id))
      .where(eq(ArrangementVersion.arrangementId, arrangementId))
      .orderBy(asc(ArrangementComment.createdAt))
      .all(),
  ]);

  return { arrangement, versions, comments };
}

export async function getArrangementById(arrangementId: string) {
  return await db.select().from(Arrangement).where(eq(Arrangement.id, arrangementId)).get() ?? null;
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export interface SubmitArrangementInput {
  title: string;
  composer?: string;
  arranger?: string;
  notes?: string;
  file?: File;
}

export async function submitArrangement(
  ensembleId: string,
  userId: string,
  input: SubmitArrangementInput
): Promise<{ error?: string; arrangementId?: string }> {
  const title = input.title.trim();
  if (!title) return { error: 'A title is required.' };

  if (!input.file || input.file.size === 0) return { error: 'An arrangement file is required.' };
  const validation = validateSongFile(input.file);
  if (!validation.valid) return { error: validation.error };

  const url = await uploadArrangementFile(input.file, ensembleId);

  const arrangementId = crypto.randomUUID();
  await db.insert(Arrangement).values({
    id: arrangementId,
    ensembleId,
    title,
    composer: input.composer?.trim() || null,
    arranger: input.arranger?.trim() || null,
    notes: input.notes?.trim() || null,
    submittedBy: userId,
  });
  await db.insert(ArrangementVersion).values({
    id: crypto.randomUUID(),
    arrangementId,
    versionNumber: 1,
    fileName: input.file.name,
    url,
    notes: null,
    uploadedBy: userId,
  });

  return { arrangementId };
}

export async function addArrangementVersion(
  arrangementId: string,
  userId: string,
  input: { notes?: string; file?: File }
): Promise<{ error?: string }> {
  const arrangement = await getArrangementById(arrangementId);
  if (!arrangement) return { error: 'Arrangement not found.' };
  if (arrangement.status === 'approved') {
    return { error: 'This arrangement has already been approved.' };
  }

  if (!input.file || input.file.size === 0) return { error: 'A file is required.' };
  const validation = validateSongFile(input.file);
  if (!validation.valid) return { error: validation.error };

  const latest = await db
    .select({ versionNumber: ArrangementVersion.versionNumber })
    .from(ArrangementVersion)
    .where(eq(ArrangementVersion.arrangementId, arrangementId))
    .orderBy(desc(ArrangementVersion.versionNumber))
    .get();

  const url = await uploadArrangementFile(input.file, arrangement.ensembleId);

  await db.insert(ArrangementVersion).values({
    id: crypto.randomUUID(),
    arrangementId,
    versionNumber: (latest?.versionNumber ?? 0) + 1,
    fileName: input.file.name,
    url,
    notes: input.notes?.trim() || null,
    uploadedBy: userId,
  });

  // A new version reopens a declined arrangement for review
  if (arrangement.status === 'declined') {
    await db.update(Arrangement).set({ status: 'in_review' }).where(eq(Arrangement.id, arrangementId));
  }

  return {};
}

export async function addArrangementComment(
  versionId: string,
  userId: string,
  content: string
): Promise<{ error?: string }> {
  const trimmed = content.trim();
  if (!trimmed) return { error: 'A comment is required.' };

  await db.insert(ArrangementComment).values({
    id: crypto.randomUUID(),
    versionId,
    userId,
    content: trimmed,
  });

  return {};
}

export async function setArrangementReviewGroup(
  ensembleId: string,
  groupId: string | null
): Promise<{ error?: string }> {
  if (groupId) {
    const group = await db
      .select({ id: Group.id })
      .from(Group)
      .where(and(eq(Group.id, groupId), eq(Group.ensembleId, ensembleId)))
      .get();
    if (!group) return { error: 'Group not found in this ensemble.' };
  }

  await db
    .update(Ensemble)
    .set({ arrangementReviewGroupId: groupId })
    .where(eq(Ensemble.id, ensembleId));
  return {};
}

/**
 * Approve an arrangement: create a Song in the ensemble's library, attach the
 * latest version's file to it, and mark the arrangement approved.
 */
export async function approveArrangement(
  arrangementId: string,
  approvedBy: string
): Promise<{ error?: string; songId?: string }> {
  const arrangement = await getArrangementById(arrangementId);
  if (!arrangement) return { error: 'Arrangement not found.' };
  if (arrangement.status === 'approved') return { error: 'Already approved.' };

  const latest = await db
    .select()
    .from(ArrangementVersion)
    .where(eq(ArrangementVersion.arrangementId, arrangementId))
    .orderBy(desc(ArrangementVersion.versionNumber))
    .get();
  if (!latest) return { error: 'This arrangement has no uploaded file.' };

  const songId = crypto.randomUUID();
  await db.insert(Song).values({
    id: songId,
    ensembleId: arrangement.ensembleId,
    name: arrangement.title,
    composer: arrangement.composer,
    arranger: arrangement.arranger,
  });

  await db.insert(SongFile).values({
    id: crypto.randomUUID(),
    songId,
    name: latest.fileName,
    url: latest.url,
    category: isAudioFile(latest.fileName) ? 'rehearsal_track' : 'sheet_music',
    uploadedBy: approvedBy,
  });

  await db
    .update(Arrangement)
    .set({ status: 'approved', approvedSongId: songId })
    .where(eq(Arrangement.id, arrangementId));

  return { songId };
}

export async function declineArrangement(arrangementId: string): Promise<{ error?: string }> {
  const arrangement = await getArrangementById(arrangementId);
  if (!arrangement) return { error: 'Arrangement not found.' };
  if (arrangement.status === 'approved') return { error: 'Already approved.' };

  await db.update(Arrangement).set({ status: 'declined' }).where(eq(Arrangement.id, arrangementId));
  return {};
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function isPdfFile(fileName: string): boolean {
  return /\.pdf$/i.test(fileName);
}

export function isAudioFile(fileName: string): boolean {
  return /\.mp3$/i.test(fileName);
}

export function statusLabel(status: string): string {
  if (status === 'in_review') return 'In Review';
  if (status === 'approved') return 'Approved';
  return 'Declined';
}

export function statusTagClass(status: string): string {
  if (status === 'in_review') return 'is-warning';
  if (status === 'approved') return 'is-success';
  return 'is-danger';
}
