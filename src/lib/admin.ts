import { db, eq, Ensemble, EnsembleMember, Song, SongFile, User } from '@db';
import { findUniqueSlug } from './slug';
import { deleteImage, deleteStorageFile } from './storage';

export async function getAllEnsembles() {
  return await db.select().from(Ensemble).all();
}

export async function getAllUsers() {
  return await db.select().from(User).all();
}

export async function getSiteAdminIds(): Promise<Set<string>> {
  const rows = await db.select({ id: User.id }).from(User).where(eq(User.role, 'admin')).all();
  return new Set(rows.map((r) => r.id));
}

export async function getUserById(userId: string) {
  return (await db.select().from(User).where(eq(User.id, userId)).get()) ?? null;
}

export async function setUserRole(userId: string, role: 'admin' | 'user') {
  await db.update(User).set({ role }).where(eq(User.id, userId));
}

/** Creates an ensemble with the creator as its first admin. */
export async function createEnsemble(params: { name: string; description: string; createdBy: string }) {
  const id = crypto.randomUUID();
  const slug = await findUniqueSlug(params.name, id);
  await db.batch([
    db.insert(Ensemble).values({ id, name: params.name, slug, description: params.description, createdBy: params.createdBy }),
    db.insert(EnsembleMember).values({ id: crypto.randomUUID(), ensembleId: id, userId: params.createdBy, role: 'admin', status: 'active' }),
  ]);
  return { id, slug };
}

/**
 * Deletes an ensemble; the database cascades to everything in it. The file list is read in the
 * same batch as the delete, so no file added in between is missed. Stored files go last, once
 * nothing in the database points at them.
 */
export async function deleteEnsemble(ensembleId: string) {
  const [songFiles, deleted] = await db.batch([
    db
      .select({ url: SongFile.url, category: SongFile.category })
      .from(SongFile)
      .innerJoin(Song, eq(SongFile.songId, Song.id))
      .where(eq(Song.ensembleId, ensembleId)),
    db.delete(Ensemble).where(eq(Ensemble.id, ensembleId)).returning({ imageUrl: Ensemble.imageUrl }),
  ]);
  if (deleted.length === 0) return;

  await Promise.all(songFiles.filter((f) => f.category !== 'link').map((f) => deleteStorageFile(f.url)));
  await deleteImage(deleted[0].imageUrl);
}
