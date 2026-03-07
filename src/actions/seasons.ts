import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertEnsembleAdmin } from './utils';
import {
  createSeason,
  updateSeason,
  deleteSeason,
  toggleSeasonMember,
} from '@lib/seasons';

export const seasons = {
  create: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      name: z.string().min(1, 'Season name is required.'),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      setActive: z.enum(['on']).optional(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await createSeason(
        input.ensembleId,
        input.name.trim(),
        input.startDate ? new Date(input.startDate) : undefined,
        input.endDate ? new Date(input.endDate) : undefined,
        input.setActive === 'on',
      );
    },
  }),

  update: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      seasonId: z.string(),
      name: z.string().min(1, 'Season name is required.'),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      setActive: z.enum(['on']).optional(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await updateSeason(
        input.seasonId,
        input.ensembleId,
        input.name.trim(),
        input.startDate ? new Date(input.startDate) : undefined,
        input.endDate ? new Date(input.endDate) : undefined,
        input.setActive === 'on',
      );
    },
  }),

  delete: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      seasonId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      const result = await deleteSeason(input.seasonId);
      if (!result.ok) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
      }
    },
  }),

  toggleMember: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      seasonId: z.string(),
      userId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await toggleSeasonMember(input.seasonId, input.userId);
    },
  }),
};
