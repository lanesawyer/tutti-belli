import { defineConfig } from 'drizzle-kit';

// Only `drizzle-kit generate` is used (no push/introspect), so no credentials here.
// Migrations are applied via db/migrate.ts (remote) and db/dev-setup.ts (local).
export default defineConfig({
  dialect: 'turso',
  schema: './db/schema.ts',
  out: './drizzle',
});
