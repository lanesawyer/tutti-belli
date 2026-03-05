import { ActionError } from 'astro:actions';
import { db, eq, and, EnsembleMember } from 'astro:db';
import { canManageEnsemble } from '@lib/permissions';

export function assertSiteAdmin(user: { role: string } | undefined | null) {
  if (!user || user.role !== 'admin') {
    throw new ActionError({ code: 'FORBIDDEN' });
  }
}

export async function assertEnsembleAdmin(ensembleId: string, user: { id: string; role: string }) {
  const membership = await db
    .select()
    .from(EnsembleMember)
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.userId, user.id)))
    .get();

  if (!canManageEnsemble(user, membership)) {
    throw new ActionError({ code: 'FORBIDDEN' });
  }
}

export async function assertEnsembleMember(ensembleId: string, user: { id: string; role: string }) {
  const membership = await db
    .select()
    .from(EnsembleMember)
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.userId, user.id)))
    .get();

  if (!membership) {
    throw new ActionError({ code: 'FORBIDDEN' });
  }

  return membership;
}
