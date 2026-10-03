import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { adminDeleteUser } from '@lib/profile';
import { createEnsemble, deleteEnsemble, getUserById, setUserRole } from '@lib/admin';
import { getEnsembleUrlId } from '@lib/slug';
import { assertSiteAdmin } from './utils';
import { setBanner, clearBanner } from '@lib/banner';

export const admin = {
  createEnsemble: defineAction({
    accept: 'form',
    input: z.object({
      name: z.string().min(1, 'Ensemble name is required.'),
      description: z.string().optional(),
    }),
    handler: async ({ name, description }, context) => {
      const user = context.locals.user;
      if (!user) {
        throw new ActionError({ code: 'UNAUTHORIZED' });
      }

      const ensemble = await createEnsemble({ name, description: description || '', createdBy: user.id });
      return { ensembleUrlId: getEnsembleUrlId(ensemble) };
    },
  }),

  deleteEnsemble: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
    }),
    handler: async ({ ensembleId }, context) => {
      assertSiteAdmin(context.locals.user);

      await deleteEnsemble(ensembleId);
    },
  }),

  toggleAdmin: defineAction({
    accept: 'form',
    input: z.object({
      userId: z.string(),
    }),
    handler: async ({ userId }, context) => {
      const user = context.locals.user;
      assertSiteAdmin(user);

      if (userId === user!.id) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Cannot change your own role.' });
      }

      const targetUser = await getUserById(userId);
      if (!targetUser) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'User not found.' });
      }

      const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
      await setUserRole(userId, newRole);

      return { name: targetUser.name, newRole };
    },
  }),

  deleteUser: defineAction({
    accept: 'form',
    input: z.object({
      userId: z.string(),
    }),
    handler: async ({ userId }, context) => {
      const user = context.locals.user;
      assertSiteAdmin(user);

      if (userId === user!.id) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Cannot delete your own account.' });
      }

      const targetUser = await getUserById(userId);
      if (!targetUser) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'User not found.' });
      }

      await adminDeleteUser(userId);

      return { name: targetUser.name };
    },
  }),

  setBanner: defineAction({
    accept: 'form',
    input: z.object({
      message: z.string().min(1, 'Banner message is required.'),
      color: z.enum(['primary', 'link', 'info', 'success', 'warning', 'danger']),
    }),
    handler: async ({ message, color }, context) => {
      assertSiteAdmin(context.locals.user);
      await setBanner(message, color);
    },
  }),

  clearBanner: defineAction({
    accept: 'form',
    input: z.object({}),
    handler: async (_input, context) => {
      assertSiteAdmin(context.locals.user);
      await clearBanner();
    },
  }),
};
