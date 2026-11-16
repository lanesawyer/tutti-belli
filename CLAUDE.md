# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
pnpm dev              # Local dev server on port 4321 (migrates + seeds local SQLite DB at .astro/content.db)
pnpm dev:remote       # Dev server connected to remote Turso DB
pnpm build            # Production build (no DB connection needed)
pnpm preview          # Preview the production build locally
pnpm check            # TypeScript type checking via astro check
pnpm lint             # Oxlint on the whole repo (TS files plus <script> blocks in .astro; frontmatter is covered by pnpm check)
pnpm fmt              # Format everything with oxfmt
pnpm db:generate      # Generate a drizzle migration from db/schema.ts changes
pnpm db:migrate       # Apply migrations to the remote Turso DB (reads .env)
```

Node and pnpm versions are pinned in `mise.toml` (`mise install`); CI and the Dockerfile install from the same file.

## Architecture

**Full-stack Astro 7 SSR app** for managing musical ensembles (rehearsals, attendance, members, repertoire). Deployed on Fly.io via Docker.

### Key Technology Choices

- **Astro 7** with `output: 'server'` — all pages are server-rendered, no client-side JS frameworks
- **Drizzle ORM** (LibSQL/Turso) — schema in `db/schema.ts`, client + query helpers re-exported from the `@db` alias (`db/index.ts`); all queries go through `src/lib/` functions or Astro Actions; never import `@db` directly in page frontmatter
- **Bulma 1.0** for CSS (dark mode supported via CSS custom properties + localStorage toggle)
- **Zero client-side JS framework** — all interactions are HTML form POSTs handled via Astro Actions (`src/actions/`)

### Import Aliases

Always use path aliases instead of relative `../` imports:

- `@db` → `db/index.ts` (drizzle client, tables, and query operators like `eq`, `and`, `desc`)
- `@actions/*` → `src/actions/*`
- `@components/*` → `src/components/*`
- `@containers/*` → `src/containers/*`
- `@layouts/*` → `src/layouts/*`
- `@lib/*` → `src/lib/*`

Example: `import MemberCard from "@components/MemberCard.astro"` not `import MemberCard from "../../components/MemberCard.astro"`.

The only exception is same-directory imports (e.g. `./AudioPlayer.astro`) and imports outside `src/` (e.g. `../../package.json`).

### Philosophy

- Don't duplicate logic, if there are commonalities, extract it into a shared utility in `src/lib/`
- Keep the frontmatter Astro files light, most server logic should be in `src/lib/` files
- **Never import `@db` in page frontmatter.** All database queries must live in `src/lib/` functions or Astro Actions (`src/actions/`). Pages call lib functions and pass the results to the template.
- **Always use `astro-bulma` components instead of writing raw Bulma HTML.** Bulma UI primitives come from the [`astro-bulma`](https://github.com/lanesawyer/astro-bulma) package (`import { Box, Button, ... } from "astro-bulma"`); `src/components/` holds app-specific components built on top of them (`MemberCard.astro`, `DashboardSection.astro`, etc.). Before writing any element with a Bulma class, check for a component first. This includes icons — always use `Icon` instead of raw `<i class="fas ...">` tags (extra classes can be appended to the `icon` prop string, e.g. `icon="fa-moon my-class"`).
- Available astro-bulma components:
  - Elements: `Block`, `Box`, `Button`, `Content`, `Delete`, `Icon`, `Image`, `Notification`, `Progress`, `Subtitle`, `Table`, `Tag`, `Title`
  - Forms: `Checkbox`, `Field`, `FileInput`, `Radio`, `Select`, `Textarea`, `TextInput`
  - Layouts: `Cell`, `Column`, `Columns`, `Container`, `Footer`, `Grid`, `Hero`, `Level`, `Media`, `PageLayout`, `Section`, `SingleColumnLayout`
  - Components: `Breadcrumb`, `Card`, `Dropdown`, `Menu`, `Message`, `Modal`, `Navbar`, `Pagination`, `Panel`, `Tabs`, `ThemeToggle`
- **Never write `<div class="box">`, `<div class="columns">`, `<h1 class="title">`, `<section class="section">`, etc.** Use `Box`, `Columns`/`Column`, `Title`/`Subtitle` (`as` prop picks the tag, `size` the `is-N` modifier), `Section`, `Container`, `Level` (with `slot="left"`/`slot="right"`), `Media`, `Hero`, `Content`, `Block` instead.
- **Never write raw `<img>` tags or `<figure class="image">` wrappers.** Always use `Image`. It wraps Bulma's image element, uses Astro's `<Image>` component for real URLs, and falls back to a plain `<img>` for data URIs. Props: `src`, `alt`, `size` (e.g. `"96x96"`), `ratio`, `rounded`, `fullwidth`, `class` (on the figure), `style` (on the figure), `imgStyle` (on the img).
- **Never write raw `<input class="input">` or `<textarea class="textarea">` elements.** Always use `TextInput`/`Textarea`. They handle the Bulma `field`/`label`/`control` wrapper, icons, help text, and all modifiers. Use the `standalone` prop when the control lives inside a `has-addons`/`is-grouped` layout or needs a custom label managed by the parent. TextInput props: `name`, `label`, `type`, `placeholder`, `value`, `required`, `disabled`, `readonly`, `color`, `size`, `rounded`, `static`, `iconLeft`, `iconLeftVariant`, `iconRight`, `iconRightVariant`, `help`, `helpColor`, `standalone`, `controlClass`, plus any native input attributes (`min`, `max`, `pattern`, `autofocus`, etc.).

### Client-side Scripts & Astro ClientRouter

`<ClientRouter />` is active globally (in `Layout.astro`), which means pages are swapped client-side without a full browser reload. **All DOM manipulation in `<script>` tags must be wrapped in `document.addEventListener('astro:page-load', () => { ... })`** — otherwise the code runs once on first load and never again after navigation.

Rules:

- **Never** call `document.querySelector`, `document.getElementById`, `document.querySelectorAll`, or attach event listeners at the top level of a `<script>`. Always put them inside an `astro:page-load` handler.
- Plain `<script>` (Astro module scripts) are deduplicated and run once ever. Wrap their DOM work in `astro:page-load`.
- Never register `astro:page-load` (or any other `document`/`window` listener) from a `<script is:inline>`. ClientRouter re-runs an inline script whenever its text is new (which `define:vars` causes whenever the data differs), and listeners on `document` survive navigation, so they pile up and keep running with stale data. Don't use `define:vars`: pass server data through `data-*` attributes (`JSON.stringify` for structured data) on an element in the page and read it inside the `astro:page-load` handler of a module script, bailing out early when that element is absent.
- Event delegation on `document` (e.g. `document.addEventListener('click', ...)`) is the one exception — `document` persists across navigations, so those listeners survive without re-registration.
- `<audio>` elements must have `audio.load()` called inside `astro:page-load` so the browser re-fetches the source after navigation.

### Request Handling Pattern

Form mutations use **Astro Actions** (`src/actions/`). Do not use the old pattern of checking `Astro.request.method === 'POST'` in page frontmatter. Actions use `defineAction` with `accept: 'form'` and a Zod schema, throw `ActionError` for failures, and delegate business logic to `src/lib/`. Pages read results via `Astro.getActionResult()` and redirect on success. The middleware runs form actions itself (`getActionContext`) so it can log one that fails with anything other than an `ActionError`; don't wrap `defineAction`.

**Every ID in an action's input must be checked against the ensemble.** `assertEnsembleAdmin(ensembleId, user)` only proves the user may act on the `ensembleId` from the form; the other IDs in the same form are just as attacker-controlled. After the permission check, call `assertInEnsemble(kind, id, ensembleId)` (from `src/actions/utils.ts`, backed by `src/lib/ownership.ts`) for each record ID, and `assertUserInEnsemble(userId, ensembleId)` for any target user. Add a new kind to `ownership.ts` when you add a table that belongs to an ensemble.

### Authentication & Authorization

- **Middleware** (`src/middleware.ts`): Runs on every request, extracts JWT from `session` cookie, populates `Astro.locals.user` and `Astro.locals.session`. Redirects unauthenticated users to `/login` for protected routes.
- **Public routes**: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/invite/join`, `/verify-email`, `/verify-email-change`, `/resend-verification`, `/health`
- **Three permission tiers**: Site admin (`User.role = 'admin'`), ensemble admin (`EnsembleMember.role = 'admin'`), and regular member
- Sessions are JWT tokens (30-day expiry) in HTTP-only cookies, signed with `JWT_SECRET`
- Passwords hashed with bcryptjs (10 rounds)
- CSRF: Astro's `checkOrigin` is on. Fly terminates TLS, so `security.allowedDomains` in `astro.config.mjs` lists the hosts whose `X-Forwarded-Proto`/`X-Forwarded-Host` Astro trusts to rebuild the https URL (`@astrojs/node` takes the plain `Host` header as-is). A host served behind a proxy that sets `X-Forwarded-Host` must be listed or its form POSTs will 403. List exact hostnames (`tuttibelli.org`, `*.tuttibelli.org`, `tutti-belli.fly.dev`), never a `*.fly.dev`-style wildcard: anyone can register a Fly app name. A PR preview's own host is added from the `PREVIEW_HOSTNAME` build arg (the list is fixed at build time; see `Dockerfile` and `fly-preview.yml`)
- Links in emails and other content that leaves the site (QR codes, set-password links) come from `getSiteUrl()`/`siteLink()` in `src/lib/site-url.ts`, never from `Astro.url`, `context.url` or request headers
- Email HTML: escape every interpolated value with `escapeHtml` (or `textToHtml` for multi-line plain text such as announcement content) from `src/lib/email.ts`
- Changing email needs the current password, notifies the old address, and on confirmation signs out every other session (`src/lib/profile.ts`)
- The middleware adds the security headers from `src/lib/security-headers.ts` to every response unless the route set its own. The Content Security Policy is enforced in a build and report-only under `astro dev`: no inline scripts, `on*` attributes or `<style is:inline>` blocks (`style=""` attributes are allowed), and any new external origin has to be added to the policy
- Failed logins, password-reset requests and email-change requests are rate-limited in memory per account and per client IP (`src/lib/rate-limit.ts`; the IP comes from Fly's `Fly-Client-IP` header). The tight login lockout is keyed on email and IP together so nobody can lock another person out
- Logout is the `auth.logout` POST action; never sign anyone out (or change any state) on a GET
- Emailed tokens (password reset, email verification, email change) are stored as `hashToken()` SHA-256 hashes and looked up by hash; only the emailed link carries the raw token
- No response to an unauthenticated visitor (or to one member about another address) may reveal whether an email has an account: same message, same cookies, and similar timing (bcrypt runs on both paths, emails to the provider are not awaited outside dev)
- An email verification link signs in only in the browser that registered or asked for the link (the `verify_email` cookie); anywhere else it verifies the address and asks the person to log in

### Database Schema

Defined in `db/schema.ts` (drizzle `sqliteTable` definitions, 26 tables). Seed data in `db/seed.ts`. Key relationships:

- **User** → **EnsembleMember** → **Ensemble** (many-to-many with role/status)
- **Ensemble** → **Part** (voice parts like Soprano, Alto, etc.)
- **Ensemble** → **Season** → **Rehearsal** → **Attendance**
- **Ensemble** → **Song** → **SongPart** (links songs to voice parts)
- **Season** → **SeasonSong**, **SeasonMembership**
- **Ensemble** → **Group** → **GroupMembership** (arbitrary member groupings)
- **Ensemble** → **Announcement**, **EnsembleInvite**
- **User** → **PasswordResetToken**

All primary keys are text UUIDs generated with `crypto.randomUUID()`. Date columns are TEXT storing ISO-8601 strings, surfaced as `Date` via a drizzle `customType` (matching the old Astro DB storage format — do not change to integer timestamps).

### Schema Migrations

Migrations live in `drizzle/` and are applied with `migrate()` from `drizzle-orm/libsql/migrator` — never `drizzle-kit push`. Workflow for a schema change:

1. Edit `db/schema.ts`
2. `pnpm db:generate` — creates a new SQL file in `drizzle/` (rename it to something descriptive and update `drizzle/meta/_journal.json` to match)
3. `pnpm dev` applies it to the local DB automatically (via `db/dev-setup.ts`); deploys apply it to the remote Turso DB automatically (Fly `release_command` in `fly.toml`/`fly.preview.toml` runs `node db/migrate.ts`); `pnpm db:migrate` applies it manually using `.env` credentials

The migration runs before the new code takes traffic, while the previous release is still serving, so it must stay compatible with that release (e.g. add a column in one deploy and drop the old one in a later deploy). Take a copy first for a risky migration: see [docs/backup-restore.md](docs/backup-restore.md#before-a-risky-change).

`drizzle/0000_init.sql` is a hand-edited baseline (`CREATE TABLE IF NOT EXISTS`) that no-ops against the production database that predates drizzle — don't regenerate it.

### Routing Structure

File-based routing under `src/pages/`. Ensemble pages live under `ensembles/[id]/` with dynamic segments. Rehearsal detail is at `ensembles/[id]/rehearsals/[rehearsalId].astro`.

### Shared Utilities (`src/lib/`)

- `auth.ts` — password hashing/verification
- `session.ts` — JWT creation, validation, user lookup from session
- `upload.ts` — image upload validation (type and size)
- `avatar.ts` — generates initials and consistent colors from user names
- `permissions.ts` — role-checking helpers
- `email.ts` — every outgoing email, sent through Resend
- `redirect.ts` — smart login redirect logic
- `env.ts` / `check-env.ts` — required environment variables, checked when the production server starts
- `health.ts` — database check behind `GET /health`, which Fly polls

### Environment Variables

**Read server secrets from `process.env`, never `import.meta.env`.** Vite writes `import.meta.env` values into the server bundle at build time, which would bake secrets into `dist/` and the Docker image. `astro.config.mjs` loads `.env` into `process.env` for `astro dev`; in production the values are Fly secrets. Secrets are never Docker build args.

The production container exits at start if a required variable is missing; add new required ones to `missingEnv` in `src/lib/env.ts`.

Required in `.env` (see `.env.example`):

- `ASTRO_DB_REMOTE_URL` / `ASTRO_DB_APP_TOKEN` — Turso database connection (names kept from the Astro DB era; they're baked into Fly/GitHub secrets)
- `DATABASE_URL` — overrides the Turso connection with a local libSQL URL (set automatically by `pnpm dev` and the test configs; no auth token used)
- `JWT_SECRET` — session token signing
- `EMAIL_API_KEY` / `EMAIL_FROM` — Resend email service (not required when `EMAIL_DISABLED` is set, which logs emails instead)
- `AWS_ENDPOINT_URL_S3` / `AWS_REGION` / `BUCKET_NAME` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — Tigris file storage (not required when `STORAGE_DISABLED` is set)

Optional:

- `SITE_URL` — base URL for links in emails and QR codes, read from `process.env` at runtime. Unset, it is `http://localhost:4321` under `astro dev` and `site` from `astro.config.mjs` (`https://tuttibelli.org`) in a build. PR previews set it to their own `https://tutti-belli-pr-<n>.fly.dev` as a Fly secret
- `PREVIEW_HOSTNAME` — build time only, not a secret: one exact extra host for `security.allowedDomains`. Passed as a Docker build arg by `fly-preview.yml`; unset for production

### Seed Data (dev mode)

`pnpm dev` seeds a fresh local DB with: admin@example.com / admin123 (site admin), test@example.com / test123 (regular user), a "Chamber Orchestra" ensemble with invite code TEST1234, voice parts, a season, and a sample rehearsal. Delete `.astro/content.db` to reset and reseed.

## Testing

```bash
pnpm test                  # Run all unit + integration tests (Vitest)
pnpm test:coverage         # Run with coverage report
pnpm test:e2e              # Run Playwright e2e tests (requires dev server)
pnpm test:e2e:ui           # Playwright UI mode
```

### Test Structure

Three tiers — write tests at the appropriate level for new code:

- **Unit** (`tests/unit/`) — Pure functions in `src/lib/` with no DB or external deps. Use Vitest. If code under test uploads, downloads, or deletes files, mock `storage.ts` so tests never reach real S3.
- **Integration** (`tests/integration/`) — `src/lib/` functions that query the DB. Use Vitest with a real in-memory LibSQL DB (`DATABASE_URL` is set in `vitest.config.ts`; `tests/integration/setup.ts` recreates the schema from the `drizzle/` migrations before each test). Use fixture helpers from `tests/integration/fixtures.ts` to create test data. Mock storage the same way as unit tests.
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
- **New Astro Action**: add it to `tests/support/action-matrix.ts` (who may call it, and a cross-ensemble case for each ID field); `tests/integration/actions.test.ts` fails until every action has an entry. Add an e2e test for the happy-path form flow.
- **New page or feature**: add an e2e test covering the primary user flow and any permission boundaries.
- **Bug fix**: add a test that would have caught the bug.
