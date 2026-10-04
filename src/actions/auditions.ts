import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import {
  createAudition,
  editAudition,
  deleteAudition,
  setAuditionStatus,
  signUpForAudition,
  withdrawFromAudition,
  setSignupSelected,
  removeSignup,
} from '@lib/auditions';
import { assertEnsembleAdmin, assertEnsembleMember, assertInEnsemble } from './utils';

const auditionFields = {
  ensembleId: z.string(),
  title: z.string().trim().min(1, 'Title is required.'),
  description: z.string().optional(),
  songId: z.string().optional(),
  deadlineDate: z.string().optional(),
  deadlineTime: z.string().optional(),
};

async function assertActiveMember(ensembleId: string, user: { id: string; role: string }) {
  const membership = await assertEnsembleMember(ensembleId, user);
  if (membership.status !== 'active') {
    throw new ActionError({ code: 'FORBIDDEN', message: 'Your membership is still pending approval.' });
  }
}

export const auditions = {
  create: defineAction({
    accept: 'form',
    input: z.object(auditionFields),
    handler: async ({ ensembleId, ...input }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      if (input.songId) await assertInEnsemble('song', input.songId, ensembleId);
      await createAudition(ensembleId, input);
    },
  }),

  edit: defineAction({
    accept: 'form',
    input: z.object({ ...auditionFields, auditionId: z.string() }),
    handler: async ({ ensembleId, auditionId, ...input }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await assertInEnsemble('audition', auditionId, ensembleId);
      if (input.songId) await assertInEnsemble('song', input.songId, ensembleId);
      await editAudition(auditionId, ensembleId, input);
    },
  }),

  setStatus: defineAction({
    accept: 'form',
    input: z.object({ ensembleId: z.string(), auditionId: z.string(), status: z.enum(['open', 'closed']) }),
    handler: async ({ ensembleId, auditionId, status }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await assertInEnsemble('audition', auditionId, ensembleId);
      await setAuditionStatus(auditionId, status);
    },
  }),

  delete: defineAction({
    accept: 'form',
    input: z.object({ ensembleId: z.string(), auditionId: z.string() }),
    handler: async ({ ensembleId, auditionId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await assertInEnsemble('audition', auditionId, ensembleId);
      await deleteAudition(auditionId);
    },
  }),

  signUp: defineAction({
    accept: 'form',
    input: z.object({ ensembleId: z.string(), auditionId: z.string(), note: z.string().optional() }),
    handler: async ({ ensembleId, auditionId, note }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertActiveMember(ensembleId, user);
      await assertInEnsemble('audition', auditionId, ensembleId);
      const result = await signUpForAudition(auditionId, user.id, note);
      if (result.type === 'error') throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
    },
  }),

  withdraw: defineAction({
    accept: 'form',
    input: z.object({ ensembleId: z.string(), auditionId: z.string() }),
    handler: async ({ ensembleId, auditionId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleMember(ensembleId, user);
      await assertInEnsemble('audition', auditionId, ensembleId);
      const result = await withdrawFromAudition(auditionId, user.id);
      if (result.type === 'error') throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
    },
  }),

  setSelected: defineAction({
    accept: 'form',
    input: z.object({ ensembleId: z.string(), signupId: z.string(), selected: z.enum(['true', 'false']) }),
    handler: async ({ ensembleId, signupId, selected }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await assertInEnsemble('auditionSignup', signupId, ensembleId);
      await setSignupSelected(signupId, selected === 'true');
    },
  }),

  removeSignup: defineAction({
    accept: 'form',
    input: z.object({ ensembleId: z.string(), signupId: z.string() }),
    handler: async ({ ensembleId, signupId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await assertInEnsemble('auditionSignup', signupId, ensembleId);
      await removeSignup(signupId);
    },
  }),
};
