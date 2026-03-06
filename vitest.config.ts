/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const root = fileURLToPath(new URL('.', import.meta.url));

// Redirect all `astro:db` imports to our in-memory SQLite mock.
// This is a Vite virtual module in the real app — it doesn't exist on disk.
const astroDbMock = path.resolve(root, 'tests/integration/__mocks__/astro-db.ts');

const sharedAlias = {
  'astro:db': astroDbMock,
};

export default defineConfig({
  resolve: {
    alias: sharedAlias,
  },
  test: {
    globals: true,
    projects: [
      {
        resolve: { alias: sharedAlias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          env: { EMAIL_DISABLED: 'true' },
        },
      },
      {
        resolve: { alias: sharedAlias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          setupFiles: ['tests/integration/setup.ts'],
          env: { EMAIL_DISABLED: 'true' },
        },
      },
    ],
    coverage: {
      provider: 'istanbul',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/email.ts', 'src/lib/storage.ts'],
      reporter: ['text', 'html'],
    },
  },
});
