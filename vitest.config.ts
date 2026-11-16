import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

const root = fileURLToPath(new URL(".", import.meta.url));

const sharedAlias = {
  "@db": path.resolve(root, "db/index.ts"),
  "@lib": path.resolve(root, "src/lib"),
  "@actions": path.resolve(root, "src/actions"),
  "astro:actions": path.resolve(root, "tests/support/astro-actions.ts"),
  "astro:middleware": "astro/middleware",
};

// Point @db at a single in-memory LibSQL database shared across the process
// (`?cache=shared` makes every createClient() call with this URL get the same
// instance — required with fileParallelism: false).
const sharedEnv = {
  DATABASE_URL: "file::memory:?cache=shared",
  EMAIL_DISABLED: "true",
  JWT_SECRET: "test-secret",
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
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          env: sharedEnv,
        },
      },
      {
        resolve: { alias: sharedAlias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
          setupFiles: ["tests/integration/setup.ts"],
          env: sharedEnv,
        },
      },
    ],
    coverage: {
      provider: "istanbul",
      include: ["src/lib/**/*.ts", "src/actions/**/*.ts", "src/middleware.ts"],
      // env.ts is unit-tested and check-env.ts only runs at server start; neither can count
      // toward thresholds that are measured on the integration project.
      exclude: ["src/lib/email.ts", "src/lib/storage.ts", "src/lib/env.ts", "src/lib/check-env.ts"],
      reporter: ["text", "html"],
      // Just under what the integration project reaches by itself, which is how CI measures it.
      // Raise them as coverage goes up.
      thresholds: {
        statements: 82,
        branches: 76,
        functions: 80,
        lines: 84,
      },
    },
  },
});
