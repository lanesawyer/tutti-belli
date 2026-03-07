import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertEnsembleAdmin } from './utils';
import {
  createGroup,
  updateGroup,
  deleteGroup,
  toggleGroupMember,
  setGroupMemberRole,
} from '@lib/groups';

export const groups = {
  create: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      name: z.string().min(1, 'Group name is required.'),
      description: z.string().optional(),
      color: z.string().default('info'),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await createGroup(
        input.ensembleId,
        input.name.trim(),
        input.description?.trim() || null,
        input.color,
      );
    },
  }),

  update: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      groupId: z.string(),
      name: z.string().min(1, 'Group name is required.'),
      description: z.string().optional(),
      color: z.string().default('info'),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await updateGroup(
        input.groupId,
        input.name.trim(),
        input.description?.trim() || null,
        input.color,
      );
    },
  }),

  delete: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      groupId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await deleteGroup(input.groupId);
    },
  }),

  toggleMember: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      groupId: z.string(),
      userId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await toggleGroupMember(input.groupId, input.userId);
    },
  }),

  setMemberRole: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      groupId: z.string(),
      userId: z.string(),
      role: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await setGroupMemberRole(input.groupId, input.userId, input.role || null);
    },
  }),
};
