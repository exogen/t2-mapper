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
`.wav` (ffmpeg) files, loads `.dts`/`.dif` directly, rebuilds
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

### Native DIF interiors

Interiors load directly from `.dif` in the browser and in the headless collision
world. No Blender add-on or converted interior `.glb` is required.

`src/dif/dif.ts` reads Tribes 2 resource version 44 / interior version 0, using the
Blender io_dif reader and the decompiled game's interior reader as references.
`src/dif/difLoader.ts` provides a Three.js `DIFLoader` (`loadAsync`, `parseAsync`, and
DOM-free `parse`) and `createDIFModel`. It builds indexed meshes with flat plane
normals, texture UVs, a separate `uv1` lightmap channel, and typed `DIFMaterial`
properties for texture paths and surface flags. The viewer resolves texture
names through the asset manifest and applies the existing Torque lighting/fog.
Embedded PNG lightmaps are decoded directly; no emissive-slot transport or glTF
custom properties are involved. Mesh coordinates use the scene's `(y, z, x)`
axis order without a Blender rotation correction.

The default is the first (highest) detail level; `createDIFModel` can select a
file-order detail index. Normal-state lighting is rendered. Alarm lightmap
indices are retained, but animated lights, resource-level path followers,
triggers, mirror rendering, and BSP visibility are not implemented.
`src/dif/difCollision.ts` uses detail 0's BSP for raycasts, matching the executable's
solid-start and coplanar rules. Clearance uses authored convex hulls and their
16×16 spatial bins, including invisible null surfaces and collision fan masks.
Sphere distances account for the instance's rotation and nonuniform scale.
Browser and headless worlds share this data; rendering LOD and material batches
do not affect collision. Lighting probes use the hit's original surface index
and lightmap texture planes directly. Triangle BVHs are built lazily only for
consumers that need polygon geometry, such as projected shadow receivers.
Vehicle clearance queries can select the resource's dedicated hull set with
`pointObstructed(point, radius, { interiorHullType: "vehicle" })`. As in the
executable's `InteriorInstance::buildConvex`, a nonempty vehicle set replaces
ordinary hulls; an absent or empty set falls back to ordinary collision.
These hulls use their own compact points and support-vertex feature streams,
including polygons that have no render mesh. Raw vehicle winding indices can
refer to obsolete authoring points, so contact geometry uses the engine's
feature stream mappings instead. Vehicle queries scan hull bounds directly;
raycasts and visibility retain the ordinary BSP regardless of hull selection.
Later Torque DIF variants are rejected with a format error.

Run `npx tsx scripts/check-dif.ts` to validate all local DIFs and their geometry.

### Native DTS shapes

Shapes load directly from DTS in the viewer and headless collision world. The
Blender conversion, Draco decoder shim, and JSON custom-property transport are
no longer required. The implementation follows `io_scene_dtst3d` in
`DynamixThreeSpaceBlenderAddon` and the Torque engine's shape, mesh, animation,
and sequence readers under `reference/TorqueEngineResources/tribes2-engine/ts`.

`DTSLoader` in `src/dts/dtsLoader.ts` provides `load`, `loadAsync`, and synchronous,
DOM-free `parse`. `parseDTS` reads versions 15–26, including the old sequential
layout, modern guarded buffer lanes, shared meshes, legacy skin tables, and
32-bit indices/secondary UVs/colors in version 26. `parseDSQ` and `mergeDSQ`
support external sequences from versions 22–26 and remap their nodes by name.
`ShapeLoader` supplies the app's manifest/texture resolution and discovers
external DSQs using the same filename-prefix rule as the Blender add-on.

The resulting model contains indexed Three meshes, authored normals, bones,
skinned meshes, materials, and one `AnimationClip` per DTS sequence. Mesh-frame
animation switches shared geometry attributes at the engine's discrete keyframe
midpoints; texture-coordinate frames and visibility use native tracks too.
Binary visibility switches at the midpoint; partial opacity keys interpolate.
Blend transforms have their own local hierarchy, and arbitrary-axis scaling
keeps its rotation/scale/inverse-rotation factors rather than losing shear.
Skins with up to four influences use `SkinnedMesh`; higher influence counts use
exact CPU deformation. IFL texture animation, sorted transparency clusters,
billboard mesh flags, decals, material wrapping/blending, detail/bump/reflectance
maps, and encoded normals retain their native representation.
Translucent materials use their authored alpha blending and depth-write rules;
the viewer preserves sorted material groups without extra whole-mesh passes.

IFL frames load once per resource and sampler configuration, including concurrent
requests. Atlas frames share their image source and have fixed UV transforms;
shape instances select a frame through native animation tracks. Repeating or
differently sized frames use individual textures. Loading is progressive: clones
created before decoding finishes receive the shared frames automatically.
Explosions and projectile bolts sample one native `ambient` clip on their playback
clock for transforms, visibility, geometry frames, and IFLs, including pauses and
seeks after the end of a one-shot. `DTSShape.time` controls unbound viewer IFLs;
`imageAnimationEnabled = false` holds the first image without changing thread state.

The app uses `DTSAnimationMixer`, a small adapter over Three's public animation
APIs. Object visibility, geometry/UV frames, decals, and IFLs follow Torque's
per-property thread priority: non-blend sequences precede blend sequences, then
higher priorities win. Unclaimed properties keep lower-priority outputs or their
authored defaults. These states are absolute even in blend sequences; only node
transforms are additive. Native mixers do the interpolation and property binding;
disjoint state clips are cached and rebuilt only when ownership changes.
Player jets, vehicle jets, ghost threads, and weapon image states all drive native
actions. Stop holds the first key, pause holds the current position, and reversing
a ghost thread preserves its position. Weapon states replace their sequence
directly, following `ShapeBase::setImageState` rather than adding a crossfade.

Numeric buffers use typed arrays, with zero-copy reads for aligned DTS lanes.
Only detail 0 and initially enabled decals become Three meshes at load time.
Other details and inactive decals stay shared descriptors; their geometry is
compiled once on first use, then cloned with instance-owned materials and bones.
The app fixes both DTS and DIF rendering at detail 0, so other visual LODs never
become scene objects during ordinary playback. Collision and LOS lookup reads
the authored mesh table independently, without creating visual hull meshes.
Bones and object animation controls remain eager for animation and attachments.
`DTSShape.onMeshAdded` lets the host initialize late meshes with the current
skin, lighting, fade/cloak and shadow state. Explicit `ensureAllDetails()`
or `buildDTS(data, { lazy: false })` expands meshes for inspection tools.

Immutable geometry attributes are shared across instances; mutable frame, decal,
and sorted-index views are allocated only when used. Previously selected hidden
branches skip world-matrix updates and refresh before becoming visible. Decals
upload buffers only when their state changes. Sorted meshes retain their authored
order while batching adjacent primitives with the same material.
`scripts/benchmark-dts.ts` compares eager/lazy construction, cloning, and frame
updates with external DSQs and rigid batching; `scripts/check-dts-lazy.ts` compares
both paths across installed assets, animations, LODs and enabled decals.
`scripts/profile-dts-demo.ts` profiles playback in the running dev server.

The shared shape loader combines compatible opaque parts once per asset,
before cloning. Stationary parts use an ordinary merged `Mesh`; articulated
parts use a Three.js `SkinnedMesh`, with each vertex following its original DTS
bone. Instances share combined geometry and keep independent skeletons and
runtime-selected skins. Lower LODs, merge transitions, hidden parts and fades
use the authored meshes; scale-animated parts keep their original normal transforms.
Damage decals, jet effects, mounts and collision geometry retain their own paths.
`scripts/check-dts-rigid-batch.ts` compares all DTS assets and animation clips
against the authored meshes; `scripts/compare-dts-batches.ts` compares general
batching, player-only batching, and original draws
in the same browser session with the scene and poses held fixed.

A shared instance renderer is enabled for every DTS category: players, scenery,
vehicles, mounted weapons, items, projectiles, and effects. Use `dtsInstancing=0`
in the viewer URL to compare with ordinary draws. Compatible visible geometry
shares `InstancedMesh` draws with independent transforms, poses, colors,
lighting, opacity, and base-texture UV transforms. Rigid draws need no bone
texture; articulated and weighted skins use a floating-point bone palette with
Three's normal GPU skinning chunks. Mixers, logical nodes, mounts, picking,
and collision stay on their conventional Three objects.

The common case shares the original texture directly. Different same-size skins
or IFL images can promote a draw to a GPU texture array, copied through Three's
texture API without canvas readback or resampling. Arrays respect GPU limits
and a 64 MiB limit per draw. Texture dimensions and sampler configuration must
match. Authored mip chains and additional material maps use native samplers.

The adapter consumes Three's culled render list after DTS detail/frame selection.
Each visible mesh/material group registers lazily and keeps its batch membership.
Reusable scalar snapshots detect changes to geometry, samplers, shaders and draw
state without rebuilding signature arrays each frame. Weak registrations do not
retain despawned meshes; unused draw resources retire after 600 frames, checked
in 60-frame sweeps. Matrices, colors, lighting, opacity and UVs upload only their
changed instance ranges through Three's buffer API; unchanged bone palettes skip
texture uploads as well. Changes within Float32 precision require no upload.
Transparent draws combine only in consecutive compatible runs, preserving their
order among other scene objects. Camera-dependent sorted meshes select shared
immutable index buffers. Multiple materials, polygon orders, geometry frames,
and GPU blend/depth states can require multiple draws even for one shape.
Singletons and unsupported custom rendering states retain native draws.

`scripts/compare-dts-instances.ts <demo-url> [output-prefix] [seek-seconds]`
compares render time, draw calls, and pixels on a real demo and a 120-player
crowd with independently advancing animations and resolved custom skins.
`scripts/check-dts-instances.ts [output-prefix]` checks real foliage, flags,
weapons, vehicles, items, and effects in normal, animated, and fading states.
See [shared DTS instancing](reference/DTS_Animated_Instancing.md) for boundaries,
measurements, and reproduction commands. Fewer draws do not imply lower CPU
frame time; animation and scene-graph updates are still performed on the CPU.

DTS-only information remains in typed `model.data`, mesh bindings, and
`DTSAnimationClip.sequence`/`triggers`, without serialization through `userData`.
Available ground motion is a separate `groundMotion` clip with the engine's
implicit identity key. DTS 22/23 do not serialize embedded ground samples;
those declarations are retained but are not turned into invented motion.
Trigger dispatch, node-pose blending, and root-motion application remain the
host animation controller's responsibility. `DTSAnimationClip.objectAnimation`
holds absolute object-state tracks for the adapter; the complete clip retains
standalone `AnimationMixer` compatibility with Three's normal blending semantics.

The viewer keeps detail 0 for rendering. Camera collision follows the engine's
authored DTS details: `TSStatic` uses `Collision-1` through `Collision-8`;
`StaticShape` prefers `LOS-9` through `LOS-16`, falling back per slot to the
corresponding collision detail. Rays clip against each mesh's convex face
planes, with animated node transforms, object visibility, and mesh frames.
There are no vegetation-name, material-transparency, or minimum-size filters.
Browser and headless worlds share this selection and collision implementation.
All details and subshapes remain available: set `scene.detailLevel` to a file-order
index, or `null` for projected-size selection, and set `scene.viewportHeight`
to the viewport height. Authored merge vertices and UVs interpolate between
details through `scene.intraDetailLevel` without changing shared source buffers.
Collision details remain hidden unless explicitly
selected with `ignoreDetailSize`. `createDTSImpostors(model, renderer)` can build
camera-facing sprite views for generated billboard LODs after their textures
load; until then those levels render their source mesh detail. Shape-local
coordinates are `(-x, z, y)`, Y up, matching the viewer's existing shape/mount
placement; the manifest now extracts mount transforms from DTS directly.

Audit local assets, including merged DSQ animations, with:

```console
node --import=tsx scripts/check-dts.ts
```
