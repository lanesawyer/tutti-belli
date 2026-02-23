import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { db, eq, and, EnsembleMember, Part } from 'astro:db';
import { canManageEnsemble } from '../lib/permissions';

async function assertAdmin(ensembleId: string, user: { id: string; role: string }) {
  const membership = await db
    .select()
    .from(EnsembleMember)
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.userId, user.id)))
    .get();

  if (!canManageEnsemble(user, membership)) {
    throw new ActionError({ code: 'FORBIDDEN' });
  }
}

export const parts = {
  add: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      name: z.string().min(1, 'Part name is required.'),
      sortOrder: z.coerce.number().int().min(0).default(0),
    }),
    handler: async ({ ensembleId, name, sortOrder }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertAdmin(ensembleId, user);

      await db.insert(Part).values({
        id: crypto.randomUUID(),
        ensembleId,
        name: name.trim(),
        sortOrder,
      });
    },
  }),

  edit: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      partId: z.string(),
      name: z.string().min(1, 'Part name is required.'),
      sortOrder: z.coerce.number().int().min(0).default(0),
    }),
    handler: async ({ ensembleId, partId, name, sortOrder }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertAdmin(ensembleId, user);

      await db
        .update(Part)
        .set({ name: name.trim(), sortOrder })
        .where(eq(Part.id, partId));
    },
  }),

  delete: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      partId: z.string(),
    }),
    handler: async ({ ensembleId, partId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertAdmin(ensembleId, user);

      const membersWithPart = await db
        .select()
        .from(EnsembleMember)
        .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.partId, partId)))
        .all();

      if (membersWithPart.length > 0) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete a part that has members assigned to it.',
        });
      }

      await db.delete(Part).where(eq(Part.id, partId));
    },
  }),
};
