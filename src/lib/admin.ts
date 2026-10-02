import { db, eq, Ensemble, EnsembleMember, User } from '@db';
import { findUniqueSlug } from './slug';

export async function getAllEnsembles() {
  return await db.select().from(Ensemble).all();
}

export async function getAllUsers() {
  return await db.select().from(User).all();
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
  await db.insert(Ensemble).values({
    id,
    name: params.name,
    slug,
    description: params.description,
    createdBy: params.createdBy,
  });
  await db.insert(EnsembleMember).values({
    id: crypto.randomUUID(),
    ensembleId: id,
    userId: params.createdBy,
    role: 'admin',
    status: 'active',
  });
  return { id, slug };
}

export async function deleteEnsemble(ensembleId: string) {
  await db.delete(EnsembleMember).where(eq(EnsembleMember.ensembleId, ensembleId));
  await db.delete(Ensemble).where(eq(Ensemble.id, ensembleId));
}
