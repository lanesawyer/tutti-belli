/**
 * Integration test setup — runs before each test file (via setupFiles in vitest.config.ts).
 * Drops all tables in the in-memory SQLite database and reapplies the drizzle
 * migrations, giving each test a clean slate with the exact production schema.
 */
import { beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

// Must use the same URL as db/index.ts (set via DATABASE_URL in vitest.config.ts)
// so we operate on the same shared in-memory DB instance.
const client = createClient({ url: 'file::memory:?cache=shared' });
const db = drizzle(client);

beforeEach(async () => {
  await client.execute('PRAGMA foreign_keys = OFF');
  const { rows } = await client.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  for (const row of rows) {
    await client.execute(`DROP TABLE IF EXISTS "${row.name}"`);
  }
  await client.execute('PRAGMA foreign_keys = ON');
  await migrate(db, { migrationsFolder: './drizzle' });
});
