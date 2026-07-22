import { existsSync, mkdirSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import seed from './seed.ts';

// Creates/migrates the local dev database and seeds it on first creation.
// Keep the file path in sync with the DATABASE_URL in the `dev` script.
const DB_FILE = '.astro/content.db';

mkdirSync('.astro', { recursive: true });
const fresh = !existsSync(DB_FILE);

const db = drizzle(createClient({ url: `file:${DB_FILE}` }));
await migrate(db, { migrationsFolder: './drizzle' });

if (fresh) {
  await seed(db);
} else {
  console.log(`✓ Local database ready (delete ${DB_FILE} to reset and reseed)`);
}
