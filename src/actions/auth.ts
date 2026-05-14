import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { auth as betterAuth } from '@lib/auth';
import { getRedirectUrl } from '@lib/redirect';

export const auth = {
  login: defineAction({
    accept: 'form',
    input: z.object({
      email: z.string().min(1, 'Email is required.'),
      password: z.string().min(1, 'Password is required.'),
      redirect: z.string().optional(),
    }),
    handler: async ({ email, password, redirect }, context) => {
      const result = await betterAuth.api.signInEmail({
        body: { email, password },
        headers: context.request.headers,
        asResponse: true,
      });

      const data = await result.json().catch(() => ({})) as { user?: { id: string; emailVerified?: boolean }; message?: string };

      if (!result.ok) {
        const message = data.message ?? '';
        if (message.toLowerCase().includes('email') && message.toLowerCase().includes('verif')) {
          throw new ActionError({ code: 'FORBIDDEN', message: `unverified:${email}` });
        }
        throw new ActionError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      }

      // Block login for unverified emails (Better Auth allows login when requireEmailVerification
      // is not set, so we enforce it here).
      if (data.user && !data.user.emailVerified) {
        throw new ActionError({ code: 'FORBIDDEN', message: `unverified:${email}` });
      }

      // Forward Better Auth's Set-Cookie headers.
      // Decode the value before passing to context.cookies.set() — Astro will re-encode it,
      // so we must start from the decoded form to avoid double URL-encoding.
      const setCookies = result.headers.getSetCookie?.() ?? (result.headers.get('set-cookie') ? [result.headers.get('set-cookie')!] : []);
      for (const cookie of setCookies) {
        const [nameVal, ...attrs] = cookie.split(';').map((s: string) => s.trim());
        const eqIdx = nameVal.indexOf('=');
        const name = nameVal.slice(0, eqIdx);
        const value = decodeURIComponent(nameVal.slice(eqIdx + 1));
        const options: Parameters<typeof context.cookies.set>[2] = { path: '/' };
        for (const attr of attrs) {
          const lower = attr.toLowerCase();
          if (lower === 'httponly') options.httpOnly = true;
          else if (lower === 'secure') options.secure = true;
          else if (lower.startsWith('max-age=')) options.maxAge = parseInt(attr.split('=')[1]);
          else if (lower.startsWith('samesite=')) options.sameSite = attr.split('=')[1].toLowerCase() as 'lax' | 'strict' | 'none';
        }
        context.cookies.set(name, value, options);
      }

      const userId = data.user?.id;
      const redirectUrl = userId ? await getRedirectUrl(userId, redirect) : (redirect ?? '/ensembles');
      return { redirectUrl };
    },
  }),

  logout: defineAction({
    accept: 'form',
    input: z.object({}),
    handler: async (_input, context) => {
      await betterAuth.api.signOut({
        headers: context.request.headers,
        asResponse: false,
      });
      for (const name of ['better-auth.session_token', 'better-auth.session_data']) {
        context.cookies.delete(name, { path: '/' });
      }
    },
  }),

  forgotPassword: defineAction({
    accept: 'form',
    input: z.object({
      email: z.string().min(1, 'Email is required.'),
    }),
    handler: async ({ email }, context) => {
      await betterAuth.api.requestPasswordReset({
        body: { email, redirectTo: '/reset-password' },
        headers: context.request.headers,
        asResponse: false,
      });
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
    handler: async ({ token, password, confirmPassword }, context) => {
      if (password !== confirmPassword) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Passwords do not match.' });
      }

      const result = await betterAuth.api.resetPassword({
        body: { token, newPassword: password },
        headers: context.request.headers,
        asResponse: true,
      });

      if (!result.ok) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'This password reset link is invalid or has expired. Please request a new one.',
        });
      }
    },
  }),
};
