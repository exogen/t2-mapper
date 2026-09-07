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

| Variable           | Default                                      | Description                           |
| ------------------ | -------------------------------------------- | ------------------------------------- |
| `RELAY_PORT`       | `8765`                                       | WebSocket listen port                 |
| `GAME_BASE_PATH`   | `docs/base` relative to relay                | Path to extracted game assets         |
| `ASSETS_REPO_*`    | see `.env.example`                           | Git checkout the Fly image syncs      |
| `MANIFEST_PATH`    | `src/manifest.json` relative to project root | Path to resource manifest             |
| `T2_MASTER_SERVER` | `master.tribesnext.com`                      | Master server for server list queries |

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

### Auto-director and observation traces

Auto-direction is independent of commentary generation. Its shared core must
support live snapshots and demos, dynamic planning in the browser, and batch
processing without an LLM, TTS, or commentary consumer. `DirectorTrackers`
accepts snapshots from either source; `createCastStream` is the shared demo
camera pipeline used by browser playback and batch generation. The incremental
switcher currently supports CTF; other modes retain their batch fallback.

The CTF pipeline advances scanning and decisions on the same half-second grid
in both modes, including during seeks. Batch generation cannot use a later
tracker enrichment to make an earlier camera decision. New camera shots are
staged against the available path before publication; their framing stays
fixed while the switcher updates cut times. Finishing a recording adds archive
metadata without restaging footage that a dynamic viewer already saw.
Existing `.cast.json` sidecars must be regenerated to use changed director rules.

An optional fact journal records when an event occurred and when each revision
actually became available. A flag drop is observable immediately; its later
pass/death classification is a new revision. Replay reveals revisions by
availability time so a finished dataset cannot leak later interpretation into
an earlier prompt.

```console
npm run cast:trace -- demos/s5-damnation.rec --to 790 --out /tmp/director-facts.json --verify
```

This builds the normal collision world, scans the demo, writes a fact trace,
and reports availability latency. `--verify` compares incremental and batch
reads and checks that enabling recording leaves the camera-only dataset
unchanged. `--step` controls the consumer's read cadence, not tracker sampling.
The trace contains the entire observed prefix, including facts before the
slice of interest. No generation APIs are called.

For a live source, create `DirectorTrackers({ factStreamId: matchEpoch })`,
feed it monotonically advancing snapshots, and call `drainFacts()` to retrieve
new records. Browser/demo callers can supply the same option to
`createDirectorScanStream` or `createCastStream`. Omit the option for normal
camera-only operation. Recording uses a pull queue with no consumer callbacks;
drain it regularly when enabled. Start new trackers and a new epoch when the
source resets. Fact IDs are stable within an epoch, not across independent
connections.

`DirectorFactReplay.advanceTo(t)` returns only newly available revisions.
These are raw director facts, including documented inferences, not curated
commentary cues or proof of camera visibility. Fact traces currently cover
server events, player deaths, skill-shot announcements, and structure changes;
state observations are available through a separate opt-in output.

Supply `stateStreamId: matchEpoch` to the same tracker/scanner/cast-stream
constructors and call `drainStates()`. It captures scoped players, their names
and target generations, flags, team scores, and the signed match clock at the
existing player sampling cadence (1 Hz with the normal 0.5-second input grid).
Frames are detached before publishing; later renames, scores, and tracker
enrichment cannot rewrite them. Raw events still use the faster fact journal.

```console
npm run cast:trace -- demos/s5-damnation.rec --to 790 --out /tmp/director-facts.json --state-out /tmp/director-states.json --verify
```

`DirectorObservationReplay` accepts the complete state trace or incremental
`append(stream.drainStates())` calls. Its `observe({ timeSec,
availableThroughSec, camera })` reads the most recent sample that satisfies
**both** the picture timestamp and the source availability limit. It never
uses a nearest-future sample or an archive shot's midpoint. Replaying a loaded
trace can seek; incoming appends must preserve sequence and epoch. The replay
retains its history, so dispose it when the match ends.

Camera observations are supplied by the camera owner. After rendering's camera
matrix updates, `captureDirectorCamera(perspectiveCamera, context)` reads the
actual pose without moving it. The context supplies the epoch, picture and
availability timestamps, stable shot ID/revision, subject, and commitment.
Pass that frame to `observe`; planned/provisional poses never certify what was
shown. The adapter supports ordinary perspective cameras; asymmetric subviews
and film offsets produce unknown visibility. The scanner's `--state-out` has
an empty camera array because scanning alone does not render the picture.

Observations include state/camera ages and freshness (default maximum ages:
1.5s and 0.25s). Stale state remains explicitly marked; its visibility is
unknown. Frustum inclusion is separate from line of sight. An optional
consumer-side `lineOfSight(eye, point)` query may report clear/blocked/unknown
against the world at the picture timestamp. Without it, an in-frame point has
unknown visibility. These are point estimates, not proof that a whole model
was visible. Missing scoped entities do not establish deaths or disconnects.

`npm run cast:export-schema` regenerates the existing cast schema plus
`generated/director-facts.schema.json`, `generated/director-observations.schema.json`
(state/camera trace), and `generated/director-observation.schema.json` (a resolved
observation). Validate serialized input before constructing a replay. The
existing archive cast sidecar contract is unchanged. Publishing authoritative
camera IDs/commitments and connecting these observations to CastGenius remain
integration work; these APIs do not claim to establish live camera transport.

Camera startup no longer waits for commentary's audio buffer or cue metadata.
Audio preloads alongside the camera and joins its clock when ready. If intro
metadata is already available, the existing archive intro start rule applies;
otherwise the director starts from its own plan. Late metadata never seeks the
picture backward to recover missed speech.
