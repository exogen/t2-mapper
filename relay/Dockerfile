FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY .yalc/ .yalc/
RUN npm ci --omit=dev

COPY relay/ relay/
COPY public/manifest.json public/manifest.json

ENV RELAY_PORT=8765
ENV GAME_BASE_PATH=/data/base
ENV MANIFEST_PATH=/app/public/manifest.json

EXPOSE 8765

CMD ["node", "--import=tsx/esm", "relay/server.ts"]
