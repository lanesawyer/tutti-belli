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

### 3. Tigris (file storage)

Song files (sheet music and recordings) are stored in [Tigris](https://fly.io/docs/tigris/), Fly.io's S3-compatible object storage. Create a private bucket attached to your app:

```bash
fly storage create -a <app-name> -n <bucket-name>
```

That sets `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `BUCKET_NAME`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as secrets on the app. It prints the keys once; save them if you also want them in a local `.env`. Any other S3-compatible store works too if you set the same variables.

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
| `AWS_ENDPOINT_URL_S3` | Object storage endpoint (`https://fly.storage.tigris.dev` for Tigris) |
| `AWS_REGION` | Object storage region (`auto` for Tigris) |
| `BUCKET_NAME` | Bucket for song files |
| `AWS_ACCESS_KEY_ID` | Object storage access key ID |
| `AWS_SECRET_ACCESS_KEY` | Object storage secret key |

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
  -e AWS_ENDPOINT_URL_S3="$AWS_ENDPOINT_URL_S3" \
  -e AWS_REGION="$AWS_REGION" \
  -e BUCKET_NAME="$BUCKET_NAME" \
  -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
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
      - AWS_ENDPOINT_URL_S3=${AWS_ENDPOINT_URL_S3}
      - AWS_REGION=${AWS_REGION}
      - BUCKET_NAME=${BUCKET_NAME}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
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
     EMAIL_FROM="..."
   ```
   Create the storage bucket with `fly storage create -a <app-name>` (see above); it sets the storage secrets itself.
4. Deploy (database credentials are runtime secrets too; the image never contains them):
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

Each preview app is named `tutti-belli-pr-<number>`, and its Turso DB and Tigris bucket are named the same. The bucket starts empty, so files from the copied production data download as 404 on previews. All three are automatically destroyed when the PR is closed.

## First Login

On first run there is no seed data in production. Use the `/register` page to create your account, then promote it to site admin directly in the database:

```bash
turso db shell tutti-belli \
  "UPDATE User SET role = 'admin' WHERE email = 'you@example.com';"
```

After that you can create ensembles and invite other users from the admin panel.
