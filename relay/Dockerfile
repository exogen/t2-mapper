FROM node:22-slim
WORKDIR /app

# git: syncAssets.ts keeps the game assets on the volume in step with the repo.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Native npm modules use node-gyp during installation. Keep its toolchain
# confined to this layer, then verify SQLite still loads after removing it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && npm ci --omit=dev \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && node -e "const db = require('better-sqlite3')(':memory:'); console.log(db.prepare('SELECT sqlite_version() AS version').get()); db.close()"

COPY relay/ relay/
COPY scripts/backup-account-database.ts scripts/backup-account-database.ts
COPY scripts/link-t2-account.ts scripts/link-t2-account.ts
COPY scripts/link-t2-accounts.ts scripts/link-t2-accounts.ts
COPY scripts/list-discord-users.ts scripts/list-discord-users.ts
COPY scripts/set-account-role.ts scripts/set-account-role.ts
COPY scripts/backfill-demo-guids.ts \
     scripts/backfill-demo-stats.ts \
     scripts/backfill-player-profiles.ts \
     scripts/merge-demo-guids.ts \
     scripts/player-loadouts.ts scripts/
COPY scripts/lib/r2.ts scripts/lib/
# Checkpoint workers replay through the same decoder and simulation as playback.
COPY src/ src/

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
