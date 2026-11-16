FROM debian:bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libatomic1 && rm -rf /var/lib/apt/lists/*
ENV MISE_DATA_DIR="/mise"
ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
ENV PNPM_HOME="/pnpm"
ENV PATH="/mise/shims:$PNPM_HOME:$PATH"
RUN curl -fsSL https://mise.run | MISE_VERSION=v2026.11.6 sh
WORKDIR /usr/src/app
# Node and pnpm versions come from mise.toml. /opt/node is what the runtime stage copies.
COPY mise.toml ./
RUN mise install && cp -a "$(mise where node)" /opt/node

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
# Not a secret: the PR preview's hostname, added to Astro's allowed hosts at build time.
ARG PREVIEW_HOSTNAME
RUN pnpm run build

# Runtime needs the server bundle, production dependencies, and db/ + drizzle/ for the
# Fly release_command (`node db/migrate.ts`). No pnpm, sources, or dev dependencies.
FROM debian:bookworm-slim
COPY --from=base /opt/node /opt/node
ENV PATH="/opt/node/bin:$PATH"
WORKDIR /usr/src/app
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY package.json ./
COPY db ./db
COPY drizzle ./drizzle
COPY src/lib/env.ts src/lib/check-env.ts ./src/lib/
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
RUN useradd --system --user-group --no-create-home app
USER app
CMD ["node", "--import", "./src/lib/check-env.ts", "./dist/server/entry.mjs"]
