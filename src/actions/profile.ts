import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import {
  registerUser,
  updateName,
  updatePhone,
  updateAvatar,
  updatePart,
  deleteAccount,
  initiateEmailChange,
} from '../lib/profile';
import { createSession } from '../lib/session';

export const profile = {
  register: defineAction({
    accept: 'form',
    input: z.object({
      name: z.string().min(1, 'Name is required.'),
      email: z.string().email('Invalid email address.'),
      password: z.string().min(6, 'Password must be at least 6 characters.'),
    }),
    handler: async ({ name, email, password }, context) => {
      let userId: string;
      try {
        ({ userId } = await registerUser({ name, email, password }));
      } catch (e) {
        throw new ActionError({ code: 'CONFLICT', message: (e as Error).message });
      }
      const sessionToken = createSession(userId);
      context.cookies.set('session', sessionToken, {
        path: '/',
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });
      return { userId };
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

  updatePart: defineAction({
    accept: 'form',
    input: z.object({
      membershipId: z.string(),
      partId: z.string().nullable(),
    }),
    handler: async ({ membershipId, partId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const result = await updatePart(membershipId, partId ?? undefined);
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
      const result = await initiateEmailChange(user.id, user.name, user.email, newEmail);
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
};
