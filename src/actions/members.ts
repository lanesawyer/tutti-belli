import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertEnsembleAdmin, assertInEnsemble } from './utils';
import { approveMember, removeMember, setMemberRole } from '@lib/ensemble';

export const members = {
  approve: defineAction({
    accept: 'form',
    input: z.object({
      membershipId: z.string(),
      ensembleId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await assertInEnsemble('membership', input.membershipId, input.ensembleId);

      if (!(await approveMember(input.membershipId))) {
        throw new ActionError({ code: 'NOT_FOUND' });
      }
    },
  }),

  reject: defineAction({
    accept: 'form',
    input: z.object({
      membershipId: z.string(),
      ensembleId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await assertInEnsemble('membership', input.membershipId, input.ensembleId);
      await removeMember(input.membershipId);
    },
  }),

  remove: defineAction({
    accept: 'form',
    input: z.object({
      membershipId: z.string(),
      ensembleId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await assertInEnsemble('membership', input.membershipId, input.ensembleId);
      await removeMember(input.membershipId);
    },
  }),

  promote: defineAction({
    accept: 'form',
    input: z.object({
      membershipId: z.string(),
      ensembleId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await assertInEnsemble('membership', input.membershipId, input.ensembleId);
      await setMemberRole(input.membershipId, 'admin');
    },
  }),

  demote: defineAction({
    accept: 'form',
    input: z.object({
      membershipId: z.string(),
      ensembleId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await assertInEnsemble('membership', input.membershipId, input.ensembleId);
      await setMemberRole(input.membershipId, 'member');
    },
  }),
};
