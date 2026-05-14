import { betterAuth } from 'better-auth';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { hashPassword as bcryptHash, verifyPassword as bcryptVerify } from './bcrypt';
import { resolve } from 'node:path';
// Tell Better Auth to use bcrypt so passwords hashed anywhere in the app are compatible

function getEnv(key: string, fallback = ''): string {
  return (typeof import.meta !== 'undefined' && import.meta.env?.[key]) ||
    process.env[key] ||
    fallback;
}

// In production (pnpm build / Fly deploy), use the remote Turso DB.
// In local dev (pnpm dev), always use the local SQLite file — even if ASTRO_DB_REMOTE_URL
// is set in the shell environment, because Astro ignores it without --remote.
const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD === true;
const remoteUrl = getEnv('ASTRO_DB_REMOTE_URL');
const localDbPath = resolve(process.cwd(), '.astro/content.db');
const dbUrl = isProd && remoteUrl ? remoteUrl : `file:${localDbPath}`;

const dialect = new LibsqlDialect({
  url: dbUrl,
  authToken: isProd ? (getEnv('ASTRO_DB_APP_TOKEN') || undefined) : undefined,
});

export const auth = betterAuth({
  database: {
    dialect,
    type: 'sqlite',
  },
  // Astro DB creates tables with PascalCase names — map Better Auth's lowercase models to them
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: {
    modelName: 'User',
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ newEmail, url, user }: { newEmail: string; url: string; user: { name: string } }) => {
        const { sendEmailChangeVerificationEmail } = await import('./email');
        await sendEmailChangeVerificationEmail(newEmail, user.name, url);
      },
    },
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'user',
        input: false,
      },
      phone: {
        type: 'string',
        required: false,
        input: true,
      },
      avatarUrl: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  } as Parameters<typeof betterAuth>[0]['user'] & { modelName: string },
  session: {
    modelName: 'Session',
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  account: { modelName: 'Account' },
  verification: { modelName: 'Verification' },
  baseURL: getEnv('BETTER_AUTH_URL', 'http://localhost:4321'),
  secret: getEnv('BETTER_AUTH_SECRET'),
  emailAndPassword: {
    enabled: true,
    password: {
      hash: bcryptHash,
      verify: ({ hash, password }: { hash: string; password: string }) => bcryptVerify(password, hash),
    },
    sendResetPassword: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
      const { sendPasswordResetEmail } = await import('./email');
      await sendPasswordResetEmail(user.email, user.name, url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
      const { sendEmailVerificationEmail } = await import('./email');
      await sendEmailVerificationEmail(user.email, user.name, url);
    },
  },
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
