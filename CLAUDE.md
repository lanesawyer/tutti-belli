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
- **Zero client-side JS framework** — all interactions are HTML form POSTs handled in the same `.astro` page frontmatter


### Philosophy
- Don't duplicate logic, if there are commonalities, extract it into a shared utility in `src/lib/`
- Keep the frontmatter Astro files light, most server logic should be in `src/lib/` files

### Request Handling Pattern
Every page that handles user actions follows this pattern in the `.astro` frontmatter:
1. Check `Astro.request.method === 'POST'`
2. Parse `await Astro.request.formData()`
3. Validate and perform DB operations
4. Redirect or re-render with error/success messages

There are no separate API routes — form handling lives directly in page components.

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
