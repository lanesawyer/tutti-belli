import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

// Load .env when running locally; deployed environments get env from the platform.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

const overrideUrl = process.env.DATABASE_URL;
const url = overrideUrl ?? process.env.ASTRO_DB_REMOTE_URL;
if (!url) {
  throw new Error('Database not configured: set DATABASE_URL or ASTRO_DB_REMOTE_URL');
}

const db = drizzle(
  createClient({
    url,
    authToken: overrideUrl ? undefined : process.env.ASTRO_DB_APP_TOKEN,
  }),
);

await migrate(db, { migrationsFolder: './drizzle' });
console.log(`✓ Migrations applied to ${url.startsWith('file:') ? url : 'remote database'}`);
