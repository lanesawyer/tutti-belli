# Testing

This project uses a **testing trophy** approach with four layers:

1. **Static analysis** — oxlint + TypeScript (`pnpm lint`, `pnpm check`)
2. **Unit tests** — pure functions in `src/lib/` (Vitest)
3. **Integration tests** — DB-dependent lib functions against in-memory SQLite (Vitest)
4. **E2E tests** — full user flows in a browser against the running dev server (Playwright)

## Commands

```bash
pnpm test              # Run all unit + integration tests (CI)
pnpm test:watch        # Watch mode
pnpm test:coverage     # Run with coverage report (output: coverage/)
pnpm test:e2e          # Run E2E tests (requires dev server or auto-starts one)
pnpm test:e2e:ui       # Open Playwright's interactive UI
```

## File Structure

```
tests/
├── unit/                        # Pure function tests — no DB, no network
│   ├── avatar.test.ts
│   ├── permissions.test.ts
│   ├── slug.test.ts
│   ├── auth.test.ts
│   ├── upload.test.ts
│   └── songs-helpers.test.ts
├── integration/                 # DB-dependent lib function tests
│   ├── __mocks__/
│   │   └── astro-db.ts          # In-memory SQLite mock for the `astro:db` virtual module
│   ├── setup.ts                 # Drops + recreates all tables before each test
│   ├── fixtures.ts              # createUser, createEnsemble, createSeason, createEvent, etc.
│   ├── session.test.ts
│   ├── profile.test.ts
│   ├── ensemble.test.ts
│   ├── songs.test.ts
│   └── events.test.ts
└── e2e/
    ├── .auth/                   # Saved login cookies (gitignored)
    ├── auth.setup.ts            # Logs in as both seed users, saves storageState
    ├── auth.spec.ts
    ├── permissions.spec.ts
    ├── events.spec.ts
    ├── songs.spec.ts
    └── ensemble.spec.ts
```

## The `astro:db` Mock

`astro:db` is a Vite virtual module — it doesn't exist on disk and can't be imported outside the Astro build pipeline. All integration tests that import `src/lib/` files (which in turn import `astro:db`) would fail without a replacement.

**How it works** ([tests/integration/__mocks__/astro-db.ts](../tests/integration/__mocks__/astro-db.ts)):

1. Creates an in-memory LibSQL client using `file::memory:?cache=shared`
2. Wraps it with Drizzle to produce a `db` instance identical in type to the real one
3. Converts each Astro table config from `db/config.ts` into a Drizzle table object via `asDrizzleTable` from `@astrojs/db/runtime`
4. Re-exports all Drizzle query helpers (`eq`, `and`, `or`, etc.) that the real module exposes
5. Re-exports `column`, `defineTable`, `defineDb`, `NOW` so `db/config.ts` itself can be imported without errors

**The alias** is set in [vitest.config.ts](../vitest.config.ts) at both the root Vite level and inside each `projects` entry (required — child projects don't inherit parent aliases):

```ts
const sharedAlias = { 'astro:db': '/path/to/tests/integration/__mocks__/astro-db.ts' };
```

**Why `defineConfig` not `getViteConfig`:** `getViteConfig` from `astro/config` loads Astro's full Vite plugin stack including `@astrojs/db`'s plugin, which eagerly tries to boot a real SQLite connection at startup — before the alias intercepts it. Plain `defineConfig` from Vitest skips all Astro plugins since we're only testing TypeScript functions.

## Integration Test Setup

[tests/integration/setup.ts](../tests/integration/setup.ts) runs `beforeEach` across all integration test files via `setupFiles` in the Vitest config. It:

1. Disables foreign key enforcement
2. Drops all 20 tables (in reverse dependency order)
3. Re-enables foreign keys and recreates all tables from hand-written DDL

This gives each test a clean database slate. The DDL mirrors `db/config.ts` exactly — if you add a table or column to the schema, update `setup.ts` to match.

The integration project uses `singleThread: true`. This is required because `file::memory:?cache=shared` only shares a single in-memory database within the same OS process. With multiple worker threads (the Vitest default), each thread gets its own process-level memory and the shared cache doesn't work.

## Mocking in Tests

**`src/lib/email.ts`** — Always mock in integration tests that call profile/email functions:
```ts
vi.mock('../../src/lib/email.ts', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
  sendEmailChangeVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  // ...
}));
```

**`src/lib/storage.ts`** — Must mock in any test that imports `src/lib/songs.ts`. `storage.ts` has module-level side effects (reads `STORAGE_ENDPOINT` env var and calls `.replace()` on it immediately on import, crashing if the env var is absent):
```ts
vi.mock('../../src/lib/storage.ts', () => ({
  validateSongFile: vi.fn().mockReturnValue({ valid: true }),
  uploadSongFile: vi.fn().mockResolvedValue('https://storage.example.com/test.pdf'),
  deleteStorageFile: vi.fn().mockResolvedValue(undefined),
}));
```

## Time-Dependent Tests

`checkInToEvent` and `checkInByCode` in `src/lib/events.ts` compare `new Date()` against event time windows. Use `vi.setSystemTime()` to control the clock:

```ts
vi.setSystemTime(new Date('2026-04-15T18:45:00.000Z')); // 15 min before a 7pm event
// ... run test
afterEach(() => vi.useRealTimers());
```

For wide-open windows in tests that don't care about timing, set `checkInStartMinutes: 9999, checkInEndMinutes: 9999` on the ensemble fixture.

## E2E Tests

E2E tests run against the real dev server. Playwright auto-starts it via `webServer` in [playwright.config.ts](../playwright.config.ts).

**Seed data** (available in every E2E run):
- `admin@example.com` / `admin123` — site admin, ensemble admin of "Chamber Orchestra"
- `test@example.com` / `test123` — regular user
- Ensemble: "Chamber Orchestra", invite code: `TEST1234`

**Auth state**: `auth.setup.ts` logs in as both users and saves their session cookies to `tests/e2e/.auth/admin.json` and `tests/e2e/.auth/user.json` (gitignored). The `chromium-admin` and `chromium-user` Playwright projects load these so individual spec files don't need to log in.

**Running E2E locally:**
```bash
# In one terminal:
pnpm dev

# In another (reuses the already-running server):
pnpm test:e2e
```

**In CI**, set `CI=true` — Playwright will start a fresh server (`reuseExistingServer: false`) and re-seed the database on each run.

## Coverage

```bash
pnpm test:coverage
```

Coverage is collected over `src/lib/**/*.ts`, excluding `email.ts` and `storage.ts` (external service wrappers with no logic worth unit testing). HTML report is written to `coverage/index.html`.
