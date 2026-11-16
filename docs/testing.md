# Testing

This project uses a **testing trophy** approach with four layers:

1. **Static analysis** — oxlint + TypeScript (`pnpm lint`, `pnpm check`)
2. **Unit tests** — pure functions in `src/lib/` (Vitest)
3. **Integration tests** — DB-dependent lib functions, Astro Actions and the middleware against in-memory SQLite (Vitest)
4. **E2E tests** — full user flows in a browser against the running dev server (Playwright)

## Commands

```bash
pnpm test              # Run all unit + integration tests (CI)
pnpm test:watch        # Watch mode
pnpm test:coverage     # Run with coverage report (output: coverage/)
pnpm test:e2e          # Run E2E tests (starts its own dev server)
pnpm test:e2e:ui       # Open Playwright's interactive UI
```

## File Structure

```
tests/
├── unit/           # Pure function tests: no DB, no network
├── integration/    # Lib functions, actions and middleware against a real in-memory database
│   ├── setup.ts    # Rebuilds the schema from the drizzle/ migrations before each test
│   └── fixtures.ts # createUser, createEnsemble, createSeason, createEvent, etc.
├── support/        # Shared helpers for action and middleware tests
│   ├── astro-actions.ts  # Stands in for the `astro:actions` virtual module under Vitest
│   ├── actions.ts        # createTestContext and callAction
│   ├── world.ts          # Two ensembles with members, for cross-ensemble tests
│   └── action-matrix.ts  # One entry per action: who may call it and with which IDs
└── e2e/
    ├── .auth/          # Saved login cookies (gitignored)
    ├── auth.setup.ts   # Logs in as the seed admin and the seed user, saves storageState
    └── *.spec.ts
```

## The Test Database

Unit and integration tests run with `DATABASE_URL=file::memory:?cache=shared` (set in [vitest.config.ts](../vitest.config.ts)), so `@db` connects to an in-memory libSQL database instead of Turso. Nothing is mocked: queries run through the same drizzle client and schema as production.

[tests/integration/setup.ts](../tests/integration/setup.ts) runs before each test. It drops every table and reapplies the migrations in `drizzle/`, so each test starts empty with the exact production schema. A schema change needs no test changes beyond its migration.

The integration project sets `fileParallelism: false` because `?cache=shared` is one database for the whole process.

## Testing Actions

`astro:actions` is a virtual module that only exists inside an Astro build. Vitest aliases it to [tests/support/astro-actions.ts](../tests/support/astro-actions.ts), which re-exports Astro's own runtime implementations, so zod parsing and `ActionError` behave as they do in production. Astro has no documented way to test actions; this reaches into `astro/dist`, so expect to adjust it on a major Astro upgrade.

`callAction(action, fields, { user })` from [tests/support/actions.ts](../tests/support/actions.ts) runs an action the way a form POST does and returns `{ data, error }`.

[tests/integration/actions.test.ts](../tests/integration/actions.test.ts) runs every action from the matrix in [tests/support/action-matrix.ts](../tests/support/action-matrix.ts): once as a permitted caller, once for each kind of caller who must be refused, and once for each ID field with a record from another ensemble. It fails if an action has no entry or an ID field has no cross-ensemble case, so a new action needs a matrix entry.

## Mocking in Tests

**`src/lib/email.ts`** — Tests run with `EMAIL_DISABLED` set, so nothing is sent. Mock the module when a test needs to assert on what was sent:

```ts
vi.mock("../../src/lib/email.ts", () => ({
  sendEmailVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendEmailChangeVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  // ...
}));
```

**`src/lib/storage.ts`** — Mock it in any test whose code uploads, downloads, or deletes song files, so tests never reach real object storage:

```ts
vi.mock("../../src/lib/storage.ts", () => ({
  validateSongFile: vi.fn().mockReturnValue({ valid: true }),
  uploadSongFile: vi.fn().mockResolvedValue("https://storage.example.com/test.pdf"),
  deleteStorageFile: vi.fn().mockResolvedValue(undefined),
}));
```

## Time-Dependent Tests

`checkInToEvent` and `checkInByCode` in `src/lib/events.ts` compare `new Date()` against event time windows. Use `vi.setSystemTime()` to control the clock:

```ts
vi.setSystemTime(new Date("2026-04-15T18:45:00.000Z")); // 15 min before a 7pm event
// ... run test
afterEach(() => vi.useRealTimers());
```

For wide-open windows in tests that don't care about timing, set `checkInStartMinutes: 9999, checkInEndMinutes: 9999` on the ensemble fixture.

## E2E Tests

E2E tests run against the real dev server. Playwright starts it via `webServer` in [playwright.config.ts](../playwright.config.ts), with `EMAIL_DISABLED` and `STORAGE_DISABLED` set.

**Seed data** (available in every E2E run):

- `admin@example.com` / `admin123` — site admin, ensemble admin of "Chamber Orchestra"
- `ensadmin@example.com` / `ensadmin123` — ensemble admin
- `test@example.com` / `test123` — regular user
- Ensemble: "Chamber Orchestra", invite code: `TEST1234`

**Auth state**: `auth.setup.ts` logs in as the admin and the regular user and saves their session cookies to `tests/e2e/.auth/admin.json` and `tests/e2e/.auth/user.json` (gitignored). The `chromium-admin` and `chromium-user` Playwright projects load these so individual spec files don't need to log in.

Playwright always starts its own server on port 4321 (`reuseExistingServer: false`), so stop any `pnpm dev` you have running first. Tests write to the local dev database at `.astro/content.db`; delete it to reseed.

Locally the suite also runs in Firefox (`firefox-admin`, `firefox-user`); CI runs Chromium only.

## Coverage

```bash
pnpm test:coverage
```

Coverage is collected over `src/lib/**/*.ts`, `src/actions/**/*.ts` and `src/middleware.ts`, excluding `email.ts` and `storage.ts` (external service wrappers) and the two startup env files. HTML report is written to `coverage/index.html`.

CI measures the integration project by itself and fails below the thresholds in [vitest.config.ts](../vitest.config.ts). If a change removes well-covered code and dips under them, add tests rather than lowering the numbers.
