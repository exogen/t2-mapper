FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY relay/ relay/
COPY src/manifest.json src/manifest.json

# Nothing sets this automatically (not the base image, not fly) — dev-only
# code branches rely on it being "production" in deploys.
ENV NODE_ENV=production
ENV RELAY_PORT=8765
ENV GAME_BASE_PATH=/data/base
ENV MANIFEST_PATH=/app/src/manifest.json

EXPOSE 8765

CMD ["node", "--import=tsx/esm", "relay/server.ts"]
