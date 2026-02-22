#!/bin/bash
set -a
source .env
set +a

fly deploy \
  --build-arg ASTRO_DB_REMOTE_URL="$ASTRO_DB_REMOTE_URL" \
  --build-arg ASTRO_DB_APP_TOKEN="$ASTRO_DB_APP_TOKEN"
