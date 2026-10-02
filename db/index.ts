import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

// Read from process.env only, never import.meta.env: Vite writes import.meta.env values into
// the server bundle at build time, which would bake the database token into the build.
// astro.config.mjs loads .env into process.env for `astro dev`.

// DATABASE_URL (set by `pnpm dev`, tests, and db scripts) forces a specific —
// usually local — database and skips the auth token. Without it, connect to
// the remote Turso database, like `astro dev --remote` used to.
const overrideUrl = process.env.DATABASE_URL;
const remoteUrl = process.env.ASTRO_DB_REMOTE_URL;
const url = overrideUrl || remoteUrl;
if (!url) {
  throw new Error('Database not configured: set DATABASE_URL or ASTRO_DB_REMOTE_URL');
}

const client = createClient({
  url,
  authToken: overrideUrl ? undefined : process.env.ASTRO_DB_APP_TOKEN,
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
