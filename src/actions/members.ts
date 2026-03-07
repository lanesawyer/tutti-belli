import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { db, eq, and, EnsembleMember, Season, SeasonMembership } from 'astro:db';
import { assertEnsembleAdmin } from './utils';
import { removeMember, setMemberRole } from '@lib/ensemble';

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

      const [membership] = await db
        .select()
        .from(EnsembleMember)
        .where(eq(EnsembleMember.id, input.membershipId));

      if (!membership) throw new ActionError({ code: 'NOT_FOUND' });

      await db
        .update(EnsembleMember)
        .set({ status: 'active' })
        .where(eq(EnsembleMember.id, input.membershipId));

      const [activeSeason] = await db
        .select()
        .from(Season)
        .where(and(eq(Season.ensembleId, input.ensembleId), eq(Season.isActive, 1)));

      if (activeSeason) {
        const [existing] = await db
          .select()
          .from(SeasonMembership)
          .where(
            and(
              eq(SeasonMembership.seasonId, activeSeason.id),
              eq(SeasonMembership.userId, membership.userId),
            ),
          );

        if (!existing) {
          await db.insert(SeasonMembership).values({
            id: crypto.randomUUID(),
            seasonId: activeSeason.id,
            userId: membership.userId,
          });
        }
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
      await db
        .delete(EnsembleMember)
        .where(eq(EnsembleMember.id, input.membershipId));
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
      await setMemberRole(input.membershipId, 'member');
    },
  }),
};
