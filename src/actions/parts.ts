import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertEnsembleAdmin, assertInEnsemble } from './utils';
import { addPart, editPart, deletePart } from '@lib/ensemble';

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
      await assertEnsembleAdmin(ensembleId, user);

      await addPart(ensembleId, name.trim(), sortOrder);
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
      await assertEnsembleAdmin(ensembleId, user);
      await assertInEnsemble('part', partId, ensembleId);

      await editPart(partId, ensembleId, name.trim(), sortOrder);
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
      await assertEnsembleAdmin(ensembleId, user);
      await assertInEnsemble('part', partId, ensembleId);

      const result = await deletePart(partId, ensembleId);
      if (!result.ok) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
      }
    },
  }),
};
