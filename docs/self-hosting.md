# Self-Hosting Tutti Belli

Tutti Belli is a server-rendered Node.js application. This guide covers what you need to run it yourself.

## External Services

The app depends on three external services. All are available on generous free tiers.

### 1. Turso (database)

Tutti Belli uses [Turso](https://turso.tech) (LibSQL) for its database.

1. Create a free account at turso.tech
2. Install the CLI: `brew install tursodatabase/tap/turso` (or see [Turso docs](https://docs.turso.tech/cli/installation))
3. Create a database:
   ```bash
   turso db create tutti-belli
   ```
4. Get your connection URL and auth token:
   ```bash
   turso db show tutti-belli --url   # → ASTRO_DB_REMOTE_URL
   turso db tokens create tutti-belli  # → ASTRO_DB_APP_TOKEN
   ```

### 2. Resend (email)

Password reset emails are sent via [Resend](https://resend.com). Sign up for a free account, create an API key, and verify a sending domain. You'll need:

- `EMAIL_API_KEY` — your Resend API key
- `EMAIL_FROM` — a verified sender address (e.g. `noreply@yourdomain.com`)

### 3. Backblaze B2 (file storage)

User avatars and ensemble images are stored in [Backblaze B2](https://www.backblaze.com/cloud-storage). Create a free account, then:

1. Create a bucket (private)
2. Create an application key scoped to that bucket

You'll need:
- `STORAGE_KEY_ID` — the application key ID
- `STORAGE_KEY` — the application key
- `STORAGE_BUCKET` — the bucket name
- `STORAGE_ENDPOINT` — the S3-compatible endpoint for your bucket's region (e.g. `https://s3.us-west-004.backblazeb2.com`)

## Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `ASTRO_DB_REMOTE_URL` | Turso database URL |
| `ASTRO_DB_APP_TOKEN` | Turso auth token |
| `JWT_SECRET` | Secret used to sign session tokens — use a long random string |
| `EMAIL_API_KEY` | Resend API key |
| `EMAIL_FROM` | Verified sender email address |
| `STORAGE_KEY_ID` | Backblaze B2 application key ID |
| `STORAGE_KEY` | Backblaze B2 application key |
| `STORAGE_BUCKET` | Backblaze B2 bucket name |
| `STORAGE_ENDPOINT` | Backblaze B2 S3-compatible endpoint URL |

Generate a strong `JWT_SECRET`:
```bash
openssl rand -base64 48
```

## Push the Database Schema

Before first run you must push the schema to Turso:

```bash
pnpm astro:db:push
```

This creates all tables. The app does not auto-migrate — re-run this command whenever the schema changes (see `db/config.ts`).

## Running with Docker

The included `Dockerfile` builds a self-contained image. The database URL and token must be passed at **build time** because Astro DB bakes them into the server bundle.

```bash
docker build \
  --build-arg ASTRO_DB_REMOTE_URL="$ASTRO_DB_REMOTE_URL" \
  --build-arg ASTRO_DB_APP_TOKEN="$ASTRO_DB_APP_TOKEN" \
  -t tutti-belli .

docker run -d \
  -p 8080:8080 \
  -e JWT_SECRET="$JWT_SECRET" \
  -e EMAIL_API_KEY="$EMAIL_API_KEY" \
  -e EMAIL_FROM="$EMAIL_FROM" \
  -e STORAGE_KEY_ID="$STORAGE_KEY_ID" \
  -e STORAGE_KEY="$STORAGE_KEY" \
  -e STORAGE_BUCKET="$STORAGE_BUCKET" \
  -e STORAGE_ENDPOINT="$STORAGE_ENDPOINT" \
  tutti-belli
```

The server listens on port `8080`. Put a reverse proxy (nginx, Caddy, Traefik) in front of it to terminate TLS.

### Docker Compose example

```yaml
services:
  app:
    build:
      context: .
      args:
        ASTRO_DB_REMOTE_URL: ${ASTRO_DB_REMOTE_URL}
        ASTRO_DB_APP_TOKEN: ${ASTRO_DB_APP_TOKEN}
    ports:
      - "8080:8080"
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - EMAIL_API_KEY=${EMAIL_API_KEY}
      - EMAIL_FROM=${EMAIL_FROM}
      - STORAGE_KEY_ID=${STORAGE_KEY_ID}
      - STORAGE_KEY=${STORAGE_KEY}
      - STORAGE_BUCKET=${STORAGE_BUCKET}
      - STORAGE_ENDPOINT=${STORAGE_ENDPOINT}
    restart: unless-stopped
```

## Deploying to Fly.io

The repo includes a `fly.toml` and a helper script:

1. Install the [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) and log in
2. Create the app (first time only):
   ```bash
   fly launch --no-deploy
   ```
3. Set secrets (runtime env vars):
   ```bash
   fly secrets set \
     JWT_SECRET="..." \
     EMAIL_API_KEY="..." \
     EMAIL_FROM="..." \
     STORAGE_KEY_ID="..." \
     STORAGE_KEY="..." \
     STORAGE_BUCKET="..." \
     STORAGE_ENDPOINT="..."
   ```
4. Deploy (passes DB credentials as build args from your local `.env`):
   ```bash
   ./deploy.sh
   ```

## GitHub Actions / PR Preview Deployments

The workflow in `.github/workflows/fly-preview.yml` automatically deploys a preview app on Fly.io and a branch database on Turso for every PR. It requires the following secrets in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Description | How to get it |
|---|---|---|
| `TURSO_API_TOKEN` | Turso platform API token (not a DB token) | `turso auth token` or Turso dashboard → Settings → API Tokens → Create token |
| `TURSO_ORG` | Your Turso organization slug | `turso org list` — use the `Name` column value |
| `TURSO_MAIN_DB` | Name of the production database to seed previews from | `turso db list` — use the `Name` column value (e.g. `tutti-belli`) |
| `FLY_ORG_TOKEN` | Fly.io org-level token (needed to create/destroy apps) | `fly tokens create org -o <your-org-slug>` |
| `FLY_API_TOKEN` | Fly.io deploy token (used by the destroy-preview job) | `fly tokens create deploy -a <app-name>` or reuse `FLY_ORG_TOKEN` |
| `JWT_SECRET` | Same value as your production secret | — |
| `EMAIL_API_KEY` | Same value as your production secret | — |
| `EMAIL_FROM` | Same value as your production secret | — |
| `STORAGE_KEY_ID` | Same value as your production secret | — |
| `STORAGE_KEY` | Same value as your production secret | — |
| `STORAGE_BUCKET` | Same value as your production secret | — |
| `STORAGE_ENDPOINT` | Same value as your production secret | — |

Each preview app is named `tutti-belli-pr-<number>` and its Turso DB is named the same. Both are automatically destroyed when the PR is closed.

## First Login

On first run there is no seed data in production. Use the `/register` page to create your account, then promote it to site admin directly in the database:

```bash
turso db shell tutti-belli \
  "UPDATE User SET role = 'admin' WHERE email = 'you@example.com';"
```

After that you can create ensembles and invite other users from the admin panel.
