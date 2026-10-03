FROM node:24.15.0-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /usr/src/app

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Runtime needs the server bundle, production dependencies, and db/ + drizzle/ for the
# Fly release_command (`node db/migrate.ts`). No pnpm, sources, or dev dependencies.
FROM node:24.15.0-slim
WORKDIR /usr/src/app
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY package.json ./
COPY db ./db
COPY drizzle ./drizzle
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
CMD ["node", "./dist/server/entry.mjs"]
