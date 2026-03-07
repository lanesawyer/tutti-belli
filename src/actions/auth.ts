import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { getUserByEmail, verifyPassword, createPasswordResetToken } from '@lib/auth';
import { createSession } from '@lib/session';
import { getRedirectUrl } from '@lib/redirect';
import { sendPasswordResetEmail } from '@lib/email';
import { validatePasswordResetToken, resetPassword as doResetPassword } from '@lib/profile';

export const auth = {
  login: defineAction({
    accept: 'form',
    input: z.object({
      email: z.string().min(1, 'Email is required.'),
      password: z.string().min(1, 'Password is required.'),
      redirect: z.string().optional(),
    }),
    handler: async ({ email, password, redirect }, context) => {
      const user = await getUserByEmail(email);

      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        throw new ActionError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      }

      if (!user.emailVerifiedAt) {
        throw new ActionError({ code: 'FORBIDDEN', message: `unverified:${email}` });
      }

      const sessionId = createSession(user.id);
      context.cookies.set('session', sessionId, {
        path: '/',
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      const redirectUrl = await getRedirectUrl(user.id, redirect);
      return { redirectUrl };
    },
  }),

  forgotPassword: defineAction({
    accept: 'form',
    input: z.object({
      email: z.string().min(1, 'Email is required.'),
    }),
    handler: async ({ email }) => {
      const user = await getUserByEmail(email);

      if (user) {
        const token = await createPasswordResetToken(user.id);
        const result = await sendPasswordResetEmail(user.email, user.name, token);
        if (!result.success) {
          console.error('Email send failed:', result.error);
          if (import.meta.env.DEV) {
            throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: `Email failed: ${result.error}` });
          }
        }
      }
      // Always return success to avoid leaking whether the email exists
    },
  }),

  resetPassword: defineAction({
    accept: 'form',
    input: z.object({
      token: z.string().min(1),
      password: z.string().min(6, 'Password must be at least 6 characters.'),
      confirmPassword: z.string().min(1, 'Please confirm your password.'),
    }),
    handler: async ({ token, password, confirmPassword }) => {
      if (password !== confirmPassword) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Passwords do not match.' });
      }

      const valid = await validatePasswordResetToken(token);
      if (!valid) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'This password reset link is invalid or has expired. Please request a new one.',
        });
      }

      const result = await doResetPassword(token, password);
      if (result.type === 'invalid') {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'This password reset link is invalid or has expired. Please request a new one.',
        });
      }
      if (result.type === 'error') {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.message });
      }
    },
  }),
};
