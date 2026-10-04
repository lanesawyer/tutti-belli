import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertEnsembleAdmin, assertInEnsemble, assertSiteAdmin } from './utils';
import { addMemberByEmail, approveMember, getEnsembleBySlugOrId, removeMember, setMemberRole } from '@lib/ensemble';
import { sendAddedToEnsembleEmail, sendWelcomeEmail } from '@lib/email';
import { getEnsembleUrlId } from '@lib/slug';

export const members = {
  // Site admins only for now: ensemble admins adding by email could probe for accounts that
  // belong to other ensembles.
  add: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      name: z.string().optional(),
      email: z.email('Enter a valid email address.'),
      role: z.enum(['member', 'admin']).default('member'),
    }),
    handler: async (input, context) => {
      assertSiteAdmin(context.locals.user);
      const ensemble = await getEnsembleBySlugOrId(input.ensembleId);
      if (!ensemble) throw new ActionError({ code: 'NOT_FOUND' });

      const result = await addMemberByEmail(ensemble.id, {
        name: input.name ?? '',
        email: input.email,
        role: input.role,
      });
      if (result.type === 'error') throw new ActionError({ code: 'BAD_REQUEST', message: result.message });

      const email = input.email.trim().toLowerCase();
      const sent =
        result.type === 'created'
          ? await sendWelcomeEmail(email, result.name, ensemble.name, result.setPasswordToken)
          : await sendAddedToEnsembleEmail(email, result.name, ensemble.name, getEnsembleUrlId(ensemble));

      return {
        name: result.name,
        emailSent: sent.success,
        setPasswordUrl:
          result.type === 'created'
            ? new URL(`/reset-password?token=${result.setPasswordToken}`, context.url.origin).toString()
            : null,
      };
    },
  }),

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
