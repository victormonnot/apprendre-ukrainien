# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim AS build

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    BUILD_STANDALONE=1

RUN npm install --global npm@11.17.0
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN mkdir -p public && npm run build

FROM node:24.21.0-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    APP_DATA_DIR=/app/.data \
    AUDIO_DISABLE_LOCAL=1

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/src/content ./src/content

COPY --from=build --chown=node:node /app/scripts/account.ts ./scripts/account.ts
COPY --from=build --chown=node:node /app/src/lib/server/auth-store.ts ./src/lib/server/auth-store.ts

# Docker initializes a new named volume with this directory's ownership.
RUN mkdir -p /app/.data && chown node:node /app/.data && chmod 700 /app/.data

USER node
EXPOSE 3000
CMD ["node", "server.js"]
