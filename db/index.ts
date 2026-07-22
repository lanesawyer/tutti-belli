import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

// Works both inside Vite (import.meta.env) and under plain `node` (process.env only).
const metaEnv: Record<string, string | undefined> =
  typeof import.meta.env === 'undefined' ? {} : import.meta.env;

// DATABASE_URL (set by `pnpm dev`, tests, and db scripts) forces a specific —
// usually local — database and skips the auth token. Without it, connect to
// the remote Turso database, like `astro dev --remote` used to.
const overrideUrl = metaEnv.DATABASE_URL || process.env.DATABASE_URL;
const remoteUrl = metaEnv.ASTRO_DB_REMOTE_URL || process.env.ASTRO_DB_REMOTE_URL;
const url = overrideUrl || remoteUrl;
if (!url) {
  throw new Error('Database not configured: set DATABASE_URL or ASTRO_DB_REMOTE_URL');
}

const client = createClient({
  url,
  authToken: overrideUrl ? undefined : metaEnv.ASTRO_DB_APP_TOKEN || process.env.ASTRO_DB_APP_TOKEN,
});

export const db = drizzle(client);

export * from './schema.ts';

export {
  eq,
  gt,
  gte,
  lt,
  lte,
  ne,
  isNull,
  isNotNull,
  inArray,
  notInArray,
  and,
  or,
  not,
  sql,
  asc,
  desc,
  count,
  countDistinct,
  avg,
  sum,
  max,
  min,
  exists,
  notExists,
  between,
  notBetween,
  like,
  notLike,
} from 'drizzle-orm';
export { alias } from 'drizzle-orm/sqlite-core';
