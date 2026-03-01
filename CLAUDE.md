# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
pnpm dev              # Local dev server on port 4321 (uses local SQLite DB)
pnpm dev:remote       # Dev server connected to remote Turso DB
pnpm build --remote   # Production build (requires remote DB connection)
pnpm preview          # Preview the production build locally
pnpm check            # TypeScript type checking via astro check
pnpm lint             # Oxlint on src/lib and db directories + astro check
pnpm fmt              # Auto-fix lint issues
pnpm astro:db:push    # Push schema changes to remote Turso DB
```

## Architecture

**Full-stack Astro 5 SSR app** for managing musical ensembles (rehearsals, attendance, members, repertoire). Deployed on Fly.io via Docker.

### Key Technology Choices
- **Astro 5** with `output: 'server'` — all pages are server-rendered, no client-side JS frameworks
- **Astro DB** (LibSQL/Turso) — queried directly in page components via `import { db, eq, ... } from 'astro:db'`
- **Bulma 1.0** for CSS (dark mode supported via CSS custom properties + localStorage toggle)
- **Zero client-side JS framework** — all interactions are HTML form POSTs handled via Astro Actions (`src/actions/`)


### Philosophy
- Don't duplicate logic, if there are commonalities, extract it into a shared utility in `src/lib/`
- Keep the frontmatter Astro files light, most server logic should be in `src/lib/` files
- **Always use components from `src/components/` instead of writing raw HTML equivalents.** Before writing a `<button>`, `<a class="button">`, or modal, check if a component exists: `Button.astro`, `Modal.astro`, `Table.astro`, `InviteCodeWidget.astro`, etc. Prefer extending a component over one-off inline markup. This includes icons — always use `Icon.astro` instead of raw `<i class="fas ...">` tags. Extra classes can be appended to the `icon` prop string (e.g. `icon="fa-moon my-class"`).
- **Never write raw `<img>` tags or `<figure class="image">` wrappers.** Always use `Image.astro` (`src/components/elements/Image.astro`). It wraps Bulma's image element, uses Astro's `<Image>` component for real URLs, and falls back to a plain `<img>` for data URIs. Props: `src`, `alt`, `size` (e.g. `"96x96"`), `ratio`, `rounded`, `fullwidth`, `class` (on the figure), `style` (on the figure), `imgStyle` (on the img).
- **Never write raw `<input class="input">` elements.** Always use `TextInput.astro` (`src/components/elements/TextInput.astro`). It handles the Bulma `field`/`label`/`control` wrapper, icons, help text, and all modifiers. Use the `standalone` prop when the input lives inside a `has-addons` or `is-grouped` layout managed by the parent. Props: `name`, `label`, `type`, `placeholder`, `value`, `required`, `disabled`, `readonly`, `color`, `size`, `rounded`, `static`, `iconLeft`, `iconLeftVariant`, `iconRight`, `iconRightVariant`, `help`, `helpColor`, `standalone`, `controlClass`, plus any native input attributes (`min`, `max`, `pattern`, `autofocus`, etc.).

### Client-side Scripts & Astro ClientRouter
`<ClientRouter />` is active globally (in `Layout.astro`), which means pages are swapped client-side without a full browser reload. **All DOM manipulation in `<script>` tags must be wrapped in `document.addEventListener('astro:page-load', () => { ... })`** — otherwise the code runs once on first load and never again after navigation.

Rules:
- **Never** call `document.querySelector`, `document.getElementById`, `document.querySelectorAll`, or attach event listeners at the top level of a `<script>`. Always put them inside an `astro:page-load` handler.
- Plain `<script>` (Astro module scripts) are deduplicated and run once ever. Wrap their DOM work in `astro:page-load`.
- `<script is:inline>` re-executes but still needs `astro:page-load` to target the current page's DOM. These are required when using `define:vars` to pass server data to the script.
- Event delegation on `document` (e.g. `document.addEventListener('click', ...)`) is the one exception — `document` persists across navigations, so those listeners survive without re-registration.
- `<audio>` elements must have `audio.load()` called inside `astro:page-load` so the browser re-fetches the source after navigation.

### Request Handling Pattern
Form mutations use **Astro Actions** (`src/actions/`). Do not use the old pattern of checking `Astro.request.method === 'POST'` in page frontmatter.

- Define actions in `src/actions/<feature>.ts` using `defineAction` with `accept: 'form'` and a Zod input schema
- Export them from `src/actions/index.ts` under the `server` object
- In pages, use `action={actions.feature.actionName}` on `<form>` elements and `Astro.getActionResult(actions.feature.actionName)` to read results
- Throw `ActionError` (from `astro:actions`) for validation/auth failures instead of returning error objects
- Business logic still lives in `src/lib/` — actions are thin wrappers that call lib functions and translate errors into `ActionError`
- Redirects on success happen in page frontmatter after checking `getActionResult`; the session cookie can be cleared inside the action handler via `context.cookies`

### Authentication & Authorization
- **Middleware** (`src/middleware.ts`): Runs on every request, extracts JWT from `session` cookie, populates `Astro.locals.user` and `Astro.locals.session`. Redirects unauthenticated users to `/login` for protected routes.
- **Public routes**: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/invite/join`
- **Three permission tiers**: Site admin (`User.role = 'admin'`), ensemble admin (`EnsembleMember.role = 'admin'`), and regular member
- Sessions are JWT tokens (30-day expiry) in HTTP-only cookies, signed with `JWT_SECRET`
- Passwords hashed with bcryptjs (10 rounds)

### Database Schema
Defined in `db/config.ts` with 16 tables. Seed data in `db/seed.ts`. Key relationships:
- **User** → **EnsembleMember** → **Ensemble** (many-to-many with role/status)
- **Ensemble** → **Part** (voice parts like Soprano, Alto, etc.)
- **Ensemble** → **Season** → **Rehearsal** → **Attendance**
- **Ensemble** → **Song** → **SongPart** (links songs to voice parts)
- **Season** → **SeasonSong**, **SeasonMembership**
- **Ensemble** → **Group** → **GroupMembership** (arbitrary member groupings)
- **Ensemble** → **Announcement**, **EnsembleInvite**
- **User** → **PasswordResetToken**

All primary keys are text UUIDs generated with `crypto.randomUUID()`.

### Routing Structure
File-based routing under `src/pages/`. Ensemble pages live under `ensembles/[id]/` with dynamic segments. Rehearsal detail is at `ensembles/[id]/rehearsals/[rehearsalId].astro`.

### Shared Utilities (`src/lib/`)
- `auth.ts` — password hashing/verification
- `session.ts` — JWT creation, validation, user lookup from session
- `upload.ts` — file upload validation (image types, 2MB max), base64 conversion for DB storage
- `avatar.ts` — generates initials and consistent colors from user names
- `permissions.ts` — role-checking helpers
- `email.ts` — Resend service integration for password reset emails
- `redirect.ts` — smart login redirect logic

### Environment Variables
Required in `.env` (see `.env.example`):
- `ASTRO_DB_REMOTE_URL` / `ASTRO_DB_APP_TOKEN` — Turso database connection
- `JWT_SECRET` — session token signing
- `EMAIL_API_KEY` / `EMAIL_FROM` — Resend email service

### Seed Data (dev mode)
Local dev auto-seeds with: admin@example.com / admin123 (site admin), test@example.com / test123 (regular user), a "Chamber Orchestra" ensemble with invite code TEST1234, voice parts, a season, and a sample rehearsal.

## Testing

```bash
pnpm test                  # Run all unit + integration tests (Vitest)
pnpm test:coverage         # Run with coverage report
pnpm test:e2e              # Run Playwright e2e tests (requires dev server)
pnpm test:e2e:ui           # Playwright UI mode
```

### Test Structure

Three tiers — write tests at the appropriate level for new code:

- **Unit** (`tests/unit/`) — Pure functions in `src/lib/` with no DB or external deps. Use Vitest. If a file imports `storage.ts`, mock it first (it has module-level S3 side effects that crash without env vars).
- **Integration** (`tests/integration/`) — `src/lib/` functions that query the DB. Use Vitest with the real LibSQL test DB (mocked via `tests/integration/__mocks__/astro-db.ts`). Use fixture helpers from `tests/integration/fixtures.ts` to create test data. Mock storage the same way as unit tests.
- **E2E** (`tests/e2e/`) — Full browser flows via Playwright. Use the `chromium-admin` project (admin auth state) for admin-gated pages. Navigate to ensemble sub-pages by constructing the URL from `page.url()` rather than clicking navbar dropdown links (they are hidden until hovered in Bulma). Submit buttons that use `form="formId"` to associate with a form outside their DOM parent must be located with `button[type="submit"][form="formId"]`.

#### Firefox-specific E2E gotchas

Two recurring issues affect the `firefox-admin` (and `firefox-user`) projects:

1. **`NS_BINDING_ABORTED` on `page.goto()`** — Firefox aborts a navigation if `page.goto()` is called while `ClientRouter` is still processing the previous page transition. Fix: always `await` a visible result on the current page (e.g. `await expect(page.locator('.notification')).toBeVisible()`) before calling `page.goto()` to navigate away.

2. **Stale emails cause duplicate-registration errors** — E2E tests run against the live dev SQLite database, so emails registered in one run persist across runs and across parallel workers. Any test that registers a new account must use a unique email per run. Use a helper like:
   ```ts
   function uniqueEmail(label: string, workerIndex: number): string {
     return `e2e-${label}-${workerIndex}-${Date.now()}@example.com`;
   }
   ```
   and pass `workerInfo.workerIndex` from the test's second argument (`async ({ page }, workerInfo)`). Never hardcode a registration email in a test that writes to the DB.

### When to Write Tests

- **New `src/lib/` function**: add a unit test; add an integration test if it touches the DB.
- **New Astro Action**: the action schema/validation logic is tested via integration tests on the underlying lib function. Add an e2e test for the happy-path form flow.
- **New page or feature**: add an e2e test covering the primary user flow and any permission boundaries.
- **Bug fix**: add a test that would have caught the bug.
