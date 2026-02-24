import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { db, eq, Ensemble, User, EnsembleMember } from 'astro:db';
import { adminDeleteUser } from '../lib/profile';
import { findUniqueSlug, getEnsembleUrlId } from '../lib/slug';
import { assertSiteAdmin } from './utils';

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

      const ensembleId = crypto.randomUUID();
      const slug = await findUniqueSlug(name, ensembleId);
      await db.insert(Ensemble).values({
        id: ensembleId,
        name,
        slug,
        description: description || '',
        createdBy: user.id,
      });

      await db.insert(EnsembleMember).values({
        id: crypto.randomUUID(),
        ensembleId,
        userId: user.id,
        role: 'admin',
        status: 'active',
      });

      return { ensembleUrlId: getEnsembleUrlId({ id: ensembleId, slug }) };
    },
  }),

  deleteEnsemble: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
    }),
    handler: async ({ ensembleId }, context) => {
      assertSiteAdmin(context.locals.user);

      await db.delete(EnsembleMember).where(eq(EnsembleMember.ensembleId, ensembleId));
      await db.delete(Ensemble).where(eq(Ensemble.id, ensembleId));
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

      const targetUser = await db.select().from(User).where(eq(User.id, userId)).get();
      if (!targetUser) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'User not found.' });
      }

      const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
      await db.update(User).set({ role: newRole }).where(eq(User.id, userId));

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

      const targetUser = await db.select().from(User).where(eq(User.id, userId)).get();
      if (!targetUser) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'User not found.' });
      }

      await adminDeleteUser(userId);

      return { name: targetUser.name };
    },
  }),
};
