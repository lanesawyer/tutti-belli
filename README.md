# Tutti Belli

A web app for running musical ensembles: members and voice parts, seasons, rehearsals and performances, attendance, repertoire, and announcements. Built with Astro, Drizzle (libSQL/Turso), and Bulma via [`astro-bulma`](https://github.com/lanesawyer/astro-bulma). Live at [tuttibelli.org](https://tuttibelli.org).

## Features

- **Roles**: site admins manage all ensembles and users; ensemble admins run their ensemble; members join with an invite code, agree to the code of conduct, and wait for an admin to approve them.
- **Members and voice parts**: per-ensemble voice parts, member profiles with avatars and part assignments, and arbitrary groups (e.g. "Section Leaders").
- **Seasons**: group events, repertoire, tasks, and membership by season.
- **Events**: rehearsals, performances, sectionals, and socials, with RSVPs and a running program of songs, breaks, and other items.
- **Attendance**: members check in from the event page or by scanning a per-event QR code within the check-in window; admins can mark attendance by hand. Per-member attendance stats, exportable as CSV along with the member list.
- **Repertoire**: songs with composer, arranger, runtime, and voice parts, plus sheet music (PDF), recordings (MP3), and links. Files live in S3-compatible storage and are served only to ensemble members.
- **Announcements**, optionally posted to Discord; **tasks** with per-member completion; a site-wide **banner** for admins.
- **Accounts**: email verification, password reset, and email changes by email. Public registration is currently disabled.
- Light and dark mode, mobile-friendly.

## Getting Started

### Prerequisites

Node.js 24.15.0 and pnpm 11.15.1. Both are pinned in `package.json` (`engines`, `volta`, and `devEngines`), and `engineStrict` is on, so other versions refuse to install.

### Setup

```bash
git clone https://github.com/lanesawyer/tutti-belli.git
cd tutti-belli
pnpm install
cp .env.example .env
pnpm dev
```

The app runs at `http://localhost:4321/`. `pnpm dev` creates, migrates, and seeds a local SQLite database at `.astro/content.db`, so development doesn't need the remote database. Delete that file to reset and reseed.

### Seed Data

| Account | Email | Password |
|---|---|---|
| Site admin | admin@example.com | admin123 |
| Ensemble admin | ensadmin@example.com | ensadmin123 |
| Regular user | test@example.com | test123 |

The seed also creates a "Chamber Orchestra" ensemble (invite code `TEST1234`) with voice parts, a "Spring 2026" season, groups, sample events, and repertoire. It only runs against the local development database.

### Environment Variables

See `.env.example`.

| Variable | Purpose |
|---|---|
| `ASTRO_DB_REMOTE_URL`, `ASTRO_DB_APP_TOKEN` | Turso database URL and token (names kept from the Astro DB era) |
| `DATABASE_URL` | Local libSQL URL that overrides Turso; `pnpm dev` and the tests set it for you |
| `JWT_SECRET` | Signs session tokens |
| `EMAIL_API_KEY`, `EMAIL_FROM` | Resend, for verification and password-reset email |
| `STORAGE_KEY_ID`, `STORAGE_KEY`, `STORAGE_BUCKET`, `STORAGE_ENDPOINT` | S3-compatible storage (Backblaze B2) for song files |
| `STORAGE_DISABLED` | Set to skip real uploads and deletes |
| `DISCORD_DISABLED` | Set to skip Discord posts |

The storage module reads `STORAGE_ENDPOINT` when it loads, so set it even in development (any `https://s3.<region>.backblazeb2.com` value works with `STORAGE_DISABLED` set).

## Development

```bash
pnpm dev           # Dev server with a local, seeded SQLite database
pnpm dev:remote    # Dev server against the remote Turso database (reads .env)
pnpm build         # Production build
pnpm preview       # Preview the production build
pnpm check         # Type checking (astro check)
pnpm lint          # Oxlint
pnpm fmt           # Auto-fix lint issues and format .astro files with Prettier
pnpm test          # Unit and integration tests (Vitest)
pnpm test:e2e      # End-to-end tests (Playwright, against the dev server)
pnpm db:generate   # Generate a migration from db/schema.ts changes
pnpm db:migrate    # Apply migrations to the remote database
```

- **Architecture and conventions**: [CLAUDE.md](CLAUDE.md) covers the code layout, Astro Actions, the `astro-bulma` component rules, client-side scripts with `ClientRouter`, authentication, migrations, and import aliases.
- **Database schema**: [`db/schema.ts`](db/schema.ts), with migrations in `drizzle/`.
- **Testing**: [docs/testing.md](docs/testing.md).

## Technology Stack

- [Astro](https://astro.build/) 7, server-rendered with the Node adapter
- [Drizzle ORM](https://orm.drizzle.team/) on [libSQL](https://github.com/tursodatabase/libsql) / [Turso](https://turso.tech/)
- [Bulma](https://bulma.io/) 1.0 through [`astro-bulma`](https://github.com/lanesawyer/astro-bulma) components, with [Font Awesome](https://fontawesome.com/) 6 icons
- JWT sessions in an HTTP-only cookie; passwords hashed with bcrypt
- [Resend](https://resend.com/) for email, Backblaze B2 for file storage
- Vitest and Playwright for tests, Oxlint for linting
- Deployed on [Fly.io](https://fly.io/) with Docker, with a preview app per pull request

## Self-Hosting

See [docs/self-hosting.md](docs/self-hosting.md) for the external services (Turso, Resend, Backblaze B2), environment variables, Docker, Fly.io deployment, and first-login setup.

## License

AGPL v3. See [LICENSE](LICENSE).

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) to learn how to get set up, what to work on, and how to submit a pull request. By participating in this project, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
