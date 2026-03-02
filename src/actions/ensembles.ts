import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { db, eq, EnsembleInvite } from 'astro:db';
import { assertEnsembleAdmin } from './utils';

export const ensembles = {
  createInvite: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      await db.insert(EnsembleInvite).values({
        id: crypto.randomUUID(),
        ensembleId: input.ensembleId,
        code,
        createdBy: user.id,
      });
    },
  }),

  deleteInvite: defineAction({
    accept: 'form',
    input: z.object({
      inviteId: z.string(),
      ensembleId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await db.delete(EnsembleInvite).where(eq(EnsembleInvite.id, input.inviteId));
    },
  }),
};
