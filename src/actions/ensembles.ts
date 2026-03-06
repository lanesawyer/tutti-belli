import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { db, eq, EnsembleInvite } from 'astro:db';
import { assertEnsembleAdmin } from './utils';
import { joinEnsembleWithCode } from '@lib/ensemble';

export const ensembles = {
  join: defineAction({
    accept: 'form',
    input: z.object({
      code: z.string().min(1),
      agreedToCodeOfConduct: z.enum(['on']).optional(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const result = await joinEnsembleWithCode(
        user.id,
        input.code.trim(),
        input.agreedToCodeOfConduct === 'on',
      );
      if (!result.ok) throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
      return { ensembleId: result.ensembleId };
    },
  }),

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
