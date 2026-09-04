# <img src="./app/icon.png" alt="T2" width="20" /> MapGenius&trade;

## Map inspector for Tribes 2.

![Screenshot of map inspector](./screenshot.png "Map inspector with Surreal loaded")

## Usage

👉 **[Open the app!](https://exogen.github.io/t2-mapper/)**

### Camera Controls

Click inside the map preview area to capture the mouse.

| Key                                      | Action               |
| ---------------------------------------- | -------------------- |
| <kbd>W</kbd>                             | Forward              |
| <kbd>A</kbd>                             | Left                 |
| <kbd>S</kbd>                             | Backward             |
| <kbd>D</kbd>                             | Right                |
| <kbd>Space</kbd>                         | Up                   |
| <kbd>Shift</kbd>                         | Down                 |
| <kbd>Esc</kbd>                           | Release mouse        |
| <small>Left click</small>                | Next observer camera |
| △ <small>Scroll/mouse wheel up</small>   | Increase speed       |
| ▽ <small>Scroll/mouse wheel down</small> | Decrease speed       |

## Development

Install dependencies:

```console
npm install
```

Run the dev server:

```console
npm start
```

### Relay Server

The relay server bridges WebSocket connections from the browser to Tribes 2 game
servers via UDP. This is necessary because browsers can't open UDP sockets
directly.

#### Local development

First, obtain TribesNext account credentials:

```console
npm run login
```

This prompts for your TribesNext username and password, downloads the account
certificate and encrypted key, and writes them to `.env.local`.

Then run the relay (or use `npm run start:both` to run it alongside the Next.js
dev server):

```console
npm run relay:dev
```

#### Deploying to Fly.io

The relay is configured for [Fly.io](https://fly.io) deployment via
`relay/Dockerfile` and `fly.toml`. It needs a persistent volume for demo
recordings and for the game assets used by the CRC integrity check.

**1. Create the app and volume:**

```console
fly launch          # creates the app (adjust app name in fly.toml if needed)
fly volumes create gamedata --region ord --size 3
```

**2. Set account credentials as secrets:**

Run `npm run login` locally first if you haven't already, then copy the values
from `.env.local`:

```console
fly secrets set \
  T2_ACCOUNT_NAME=... \
  T2_ACCOUNT_PASSWORD=... \
  T2_ACCOUNT_CERTIFICATE=... \
  T2_ACCOUNT_ENCRYPTED_KEY=...
```

**3. Deploy:**

```console
fly deploy
```

**4. Game assets on the volume:**

Nothing to do: at every boot the relay refreshes a sparse git checkout of the
shapes it needs (`relay/syncAssets.ts`, a few MB) at `/data/t2-mapper`, so the
volume always matches `main`. After a push that adds shapes, `fly deploy` picks
up both the new manifest (baked into the image) and the new files. To refresh
without a deploy:

```console
fly ssh console -C "node --import=tsx/esm relay/syncAssets.ts"
```

**Environment variables** (all optional, with defaults):

| Variable           | Default                                         | Description                           |
| ------------------ | ----------------------------------------------- | ------------------------------------- |
| `RELAY_PORT`       | `8765`                                          | WebSocket listen port                 |
| `GAME_BASE_PATH`   | `docs/base` relative to relay                   | Path to extracted game assets         |
| `ASSETS_REPO_*`    | see `.env.example`                              | Git checkout the Fly image syncs      |
| `MANIFEST_PATH`    | `public/manifest.json` relative to project root | Path to resource manifest             |
| `T2_MASTER_SERVER` | `master.tribesnext.com`                         | Master server for server list queries |

### Adding game assets

Point `add-vl2` at a `.vl2` and it walks through every consumer, asking
before each step (`--dry-run` only reports; `--yes` takes the defaults):

```console
npm run add-vl2 -- path/to/MapPack.vl2
```

It extracts the archive under `docs/base/@vl2` (or updates an existing
extraction), reports which existing resources it overrides, converts its
`.dif`/`.dts` (Blender) and `.wav` (ffmpeg) files, rebuilds
`src/manifest.json`, runs the typecheck, and then offers to commit, push
(which deploys the assets and site), and redeploy the relay.

The manifest carries the resource index, the mission list, and each shape's
mount-node transforms; regenerate it on its own with `npm run build:manifest`.

### Running scripts

[tsx](https://tsx.is) is included to run TypeScript files directly.

Example:

```console
tsx scripts/generate-manifest.ts --quiet
```
