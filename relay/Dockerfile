FROM node:22-slim
WORKDIR /app

# git: syncAssets.ts keeps the game assets on the volume in step with the repo.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY relay/ relay/
COPY src/manifest.json src/manifest.json

# Nothing sets this automatically (not the base image, not fly) — dev-only
# code branches rely on it being "production" in deploys.
ENV NODE_ENV=production
ENV RELAY_PORT=8765
# A sparse git checkout on the volume, refreshed at every boot (see
# relay/syncAssets.ts).
ENV ASSETS_REPO_DIR=/data/t2-mapper
ENV GAME_BASE_PATH=/data/t2-mapper/docs/base
ENV MANIFEST_PATH=/app/src/manifest.json

EXPOSE 8765

# Sync first, then start regardless: a failed sync keeps the last checkout.
CMD ["sh", "-c", "node --import=tsx/esm relay/syncAssets.ts; exec node --import=tsx/esm relay/server.ts"]
