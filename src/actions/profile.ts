import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertPartsInEnsemble } from './utils';
import { getMembershipById } from '@lib/ensemble';
import { revokeSessions, startSession } from '@lib/session';
import {
  registrationsByIp,
  registrationsSiteWide,
  requestIp,
  retryAfter,
  tooManyAttemptsMessage,
} from '@lib/rate-limit';
import {
  registerUser,
  updateName,
  updatePhone,
  updateAvatar,
  updateParts,
  deleteAccount,
  initiateEmailChange,
} from '@lib/profile';

export const profile = {
  register: defineAction({
    accept: 'form',
    input: z.object({
      name: z.string().min(1, 'Name is required.'),
      email: z.string().email('Invalid email address.'),
      password: z.string().min(6, 'Password must be at least 6 characters.'),
    }),
    handler: async ({ name, email, password }, context) => {
      // E2E runs register many accounts from localhost against a long-lived dev server
      if (!import.meta.env.DEV) {
        const ip = requestIp(context);
        const wait = retryAfter([
          [registrationsByIp, ip],
          [registrationsSiteWide, 'all'],
        ]);
        if (wait) {
          throw new ActionError({ code: 'TOO_MANY_REQUESTS', message: tooManyAttemptsMessage(wait) });
        }
        registrationsByIp.record(ip);
        registrationsSiteWide.record('all');
      }

      try {
        await registerUser({ name, email, password, siteUrl: context.url.origin });
      } catch (e) {
        throw new ActionError({ code: 'CONFLICT', message: (e as Error).message });
      }
      return { email };
    },
  }),

  updateName: defineAction({
    accept: 'form',
    input: z.object({
      name: z.string(),
    }),
    handler: async ({ name }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const result = await updateName(user.id, name);
      if (result.type === 'error') {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
    },
  }),

  updatePhone: defineAction({
    accept: 'form',
    input: z.object({
      phone: z.string().nullable(),
    }),
    handler: async ({ phone }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const result = await updatePhone(user.id, phone ?? undefined);
      if (result.type === 'error') {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
    },
  }),

  updateInfo: defineAction({
    accept: 'form',
    input: z.object({
      name: z.string(),
      phone: z.string().nullable(),
      avatar: z.instanceof(File).optional(),
      removeAvatar: z.coerce.boolean().optional(),
    }),
    handler: async ({ name, phone, avatar, removeAvatar }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const nameResult = await updateName(user.id, name);
      if (nameResult.type === 'error') {
        throw new ActionError({ code: 'BAD_REQUEST', message: nameResult.message });
      }
      const phoneResult = await updatePhone(user.id, phone ?? undefined);
      if (phoneResult.type === 'error') {
        throw new ActionError({ code: 'BAD_REQUEST', message: phoneResult.message });
      }
      const avatarResult = await updateAvatar(
        user.id,
        user.avatarUrl,
        avatar ?? new File([], ''),
        removeAvatar ?? false
      );
      if (avatarResult.type === 'error') {
        throw new ActionError({ code: 'BAD_REQUEST', message: avatarResult.message });
      }
    },
  }),

  updateAvatar: defineAction({
    accept: 'form',
    input: z.object({
      avatar: z.instanceof(File).optional(),
      removeAvatar: z.coerce.boolean().optional(),
    }),
    handler: async ({ avatar, removeAvatar }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const result = await updateAvatar(
        user.id,
        user.avatarUrl,
        avatar ?? new File([], ''),
        removeAvatar ?? false
      );
      if (result.type === 'error') {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
    },
  }),

  updateParts: defineAction({
    accept: 'form',
    input: z.object({
      membershipId: z.string(),
      partIds: z.string().array().optional().default([]),
    }),
    handler: async ({ membershipId, partIds }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const membership = await getMembershipById(membershipId);
      if (!membership || membership.userId !== user.id) {
        throw new ActionError({ code: 'FORBIDDEN' });
      }
      await assertPartsInEnsemble(partIds, membership.ensembleId);
      const result = await updateParts(membershipId, partIds);
      if (result?.type === 'error') {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
    },
  }),

  changeEmail: defineAction({
    accept: 'form',
    input: z.object({
      newEmail: z.string(),
    }),
    handler: async ({ newEmail }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const result = await initiateEmailChange(user.id, user.name, user.email, newEmail, context.url.origin);
      if (result.type === 'error') {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
    },
  }),

  deleteAccount: defineAction({
    accept: 'form',
    input: z.object({
      password: z.string(),
    }),
    handler: async ({ password }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const result = await deleteAccount(user.id, user.role, password);
      if (result.type === 'error') {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
      context.cookies.delete('session', { path: '/' });
    },
  }),

  signOutOtherDevices: defineAction({
    accept: 'form',
    handler: async (_input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      // Re-issuing the cookie here would hand the admin a session as the viewed user.
      if (context.locals.viewingAs) {
        throw new ActionError({ code: 'FORBIDDEN', message: 'Stop viewing as this user first.' });
      }
      const sessionVersion = await revokeSessions(user.id);
      if (sessionVersion === null) throw new ActionError({ code: 'UNAUTHORIZED' });
      startSession(context.cookies, { id: user.id, sessionVersion });
    },
  }),
};
