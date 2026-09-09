# Shared DTS instancing

The viewer enables one shared draw pool for all DTS categories. Set
`dtsInstancing=0` in the URL to compare with the native renderer. Shapes are
classified by their current geometry, shader and GPU state, never by filenames
or gameplay categories. No DTS feature is removed to make a shape eligible.

## What the app actually varies

| App usage                                                        | Independent state                                                                 | Draw implications                                                                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Players (`PlayerModel.tsx`)                                      | Pose, selected custom skin, lighting, fade/cloak, damage, mounts                  | Bone palettes and skin layers vary per instance. HD texture dimensions can split arrays.                        |
| Generic entities (`EntityRenderer.tsx`, `GenericShape.tsx`)      | Position/scale, item spin, turret aim, vehicle wheels/jets, animation threads     | Transforms and poses can share a draw; different visible geometry or GPU states can split it.                   |
| Flags and mounted equipment                                      | Entity and image-slot `skinName`                                                  | Non-player textures are also replaced through the `base.` skin prefix in `playbackUtils.ts`.                    |
| Projectiles/explosions (`useEffectShapeScene.ts`, `iflAtlas.ts`) | Independent IFL clocks, texture frames, animated visibility and scale             | Shared images use native samplers; compatible different frames can select array layers.                         |
| Cloaking (`shapeFadeCloak.ts`)                                   | Scrolling cloak texture, separate rules for mounted images, opacity/depth changes | UV transforms and opacity are instance data, but the GPU blend/depth mode and transparent ordering still apply. |
| Sorted foliage and damage meshes (`dtsModel.ts`)                 | Camera-dependent primitive order, decal/frame selection                           | Matching current buffers share draws; different polygon orders or geometry frames require separate draws.       |

The September 8 asset audit parsed 345 local DTS files. Of these, 142 contain
material entries with different lighting/blending flags, 48 contain IFL
materials, 35 contain sorted meshes, 54 contain decal meshes, 4 contain weighted
skins, and 39 contain vertex or material-coordinate frame animation. These are
file capabilities, not assertions that every material or mesh is currently
visible. Runtime checks exercise the actual selected materials and buffers.

For example, `weapon_energy` has different material behaviors even for slots
that name the same texture. Foliage mixes opaque bark and translucent leaves.
The flag test renders `beagle` and `dsword` skins simultaneously. Consequently,
texture dimensions are not the only reason one DTS asset can require multiple
batches. Different pose, position, color, lighting, opacity, or base-map UV
transform alone do not require separate batches in this implementation.

## Rendering and ownership

- The adapter uses Three's existing culled render list after native DTS state
  selection. Its final LOD child submits ordinary `InstancedMesh` objects through
  Three's normal buffer upload and render paths. It does not traverse the logical
  scene again or run a second animation pass.
- Rigid shapes share vertex/index buffers and use instance matrices. Articulated
  and weighted meshes use a floating-point bone texture and Three's normal
  skinning shader chunks. Native morph influences use `InstancedMesh.setMorphAt`.
- Color, shape lighting, opacity and base-map UV transforms are instance
  attributes. An ordinary shared texture needs no texture array or GPU copy.
  Multiple compatible images promote a draw to a texture array; dimensions,
  color space and sampler settings must match. Array uploads use Three's GPU
  copy API, preserve alpha, and are bounded by GPU limits and 64 MiB per draw.
  A full array spills into another draw instead of dropping instances.
- Authored mipmaps and additional material maps use native sampler slots. Detail
  shader configuration is tracked explicitly. Texture and geometry compatibility
  use reusable scalar snapshots. Source registrations and batch pages persist;
  unchanged frames neither rebuild signature arrays nor replace membership.
  Texture metadata is read once per texture per preparation. Signatures still
  detect direct Three property edits that do not increment a version counter.
- Instance attributes compare in Float32 precision and submit only changed ranges
  through Three's update-range API. Unchanged bone palettes skip texture uploads.
  Weak registrations do not retain despawned meshes. Live signatures keep their
  shared IDs when new assets arrive; unused signature keys can be collected.
- Transparent items combine only within consecutive compatible runs in Three's
  sorted list. Foreign scene objects interrupt runs. Pooled draws retain the
  original depth, render order, group order and stable sorting identity.
  The small renderer-list integration is isolated in `dtsInstanceRenderList.ts`;
  browser regression checks should accompany Three upgrades.
- Sorted DTS meshes select immutable shared index buffers for matching cluster
  paths. Each binding caches up to 64 paths. Instance cleanup does not dispose
  cache-owned vertex/index buffers.
- Logical scene nodes, mixers, mounts, collision and picking remain ordinary
  Three objects. The pool owns only draw wrappers, instance attributes, optional
  bone/skin textures and material copies. Source visibility and layers remain
  untouched. Pools grow geometrically and release draws unused for 600 frames,
  checked in 60-frame sweeps.

Single remaining copies use their native draw. Native rendering also handles
custom shaders/callbacks, shadow-specific materials, shear/reflected transforms,
double-sided transparency requiring two passes, and other incompatible states.
Array cameras, override materials and disabled object sorting bypass pooling;
custom sort functions and reversed-depth sorting restore the original render
items. These preserve behavior instead of assuming every possible Three render
state can be represented by one instanced draw.

## Measurements

September 8, 2026; headless Chromium, ANGLE Metal on Apple M1 Max; development
server. The supplied Massive recording was paused at 600 seconds with all 29
players and their 24 resolved body skins loaded. Each path ran twice for 120
frames after warmup. The crowd uses those same skins and independent animations.

| Scene             | Native calls | Shared calls | Native render CPU | Shared render CPU |
| ----------------- | -----------: | -----------: | ----------------: | ----------------: |
| Massive recording |          197 |          138 |          12.40 ms |          13.41 ms |
| 120-player crowd  |          600 |           10 |          14.38 ms |          16.28 ms |

Times average both passes and include pool preparation, packing, uploads and
Three rendering. They exclude demo simulation and are not playback FPS or GPU
execution-time measurements. Draw calls fall substantially, but CPU render time
is still approximately 8–13% higher. CPU profiling is dominated by scene-graph
world transforms and projection, which are retained for native animation and
attachments. This change does not establish an FPS improvement.

The previous glTF player renderer already used `SkeletonUtils.clone`, one
`AnimationMixer` per player, CPU node/world updates, and GPU skinning. These
categories of work are not new. The direct DTS representation expanded the
scene graph: cached `light_male.glb` contains 59 serialized nodes and 32 joints;
the original eager DTS builder with the same 42 sequences constructed 1,658 Three
objects (113 visible in the default state), including 86 bone/helper objects
for 32 authored DTS nodes. The retained LOD/decal branches and extra transform
helpers added work that conversion had flattened or omitted. Hidden detail
branches skip descendant matrix updates, so 1,658 does not mean that every
object computes a world matrix each frame. The lazy branch change below reduces that representation; CPU animation itself
is not an inherent disadvantage of the DTS format.

Triangles match: 197,750 in the recording and 233,846 in the crowd. At a 3/255
pixel threshold, 17 recording-wide pixels, 37 close-view pixels and 88 crowd
pixels differ out of 921,600; no WebGL errors occur. Separate checks exercise
nine real assets in normal, independently animated and fading states (27 cases),
including `borg18`, `borg19`, flag skins, weapons, items, vehicles and effects.
All triangle counts match, with 0–258 differing pixels per 960×720 image and no
WebGL errors. Unit tests cover transparent interleaving, skin size/state changes,
poses/normals, UV/color/opacity, native mipmaps/maps, geometry frames, sorted
index sharing, pool growth and cleanup.

## Lazy visual branches

The app does not currently switch DTS or DIF visual LODs with distance: both
render detail 0. The DTS builder now creates only that detail and initially
active decals. Other mesh/detail branches remain asset-level descriptors;
collision and LOS hulls come directly from the raw mesh table. Animation tracks
still bind to ready bones/object controls, so enabling a decal does not require
rebuilding mixers or replaying animation. A late skin binds to its own instance's
current bones. Material processing, custom skins, IFL discovery, lighting,
fade/cloak, visibility lists and shadow proxies handle late meshes as well.

Once requested, a branch stays available on that instance. Immutable geometry
and frame buffers are compiled once and shared across clones; mutable geometry
remains instance-owned. Tools can opt into full eager expansion with
`buildDTS(data, { lazy: false })`; `scene.ensureAllDetails()` expands visual
branches on an existing instance.

Local Node benchmark, with external DSQs and asset-level rigid batching:

| Shape             | Eager objects | Lazy objects | Eager meshes | Lazy meshes | Clone eager → lazy |
| ----------------- | ------------: | -----------: | -----------: | ----------: | -----------------: |
| light_male        |         1,658 |          166 |          773 |          27 |     9.14 → 0.51 ms |
| vehicle_air_scout |         1,238 |          120 |          576 |          17 |     5.97 → 0.58 ms |
| borg18            |            98 |           48 |           31 |           6 |     0.36 → 0.15 ms |
| weapon_energy     |           115 |           53 |           43 |          10 |     0.43 → 0.17 ms |

Counts include combined draw meshes and their retained source parts. The
24-player CPU animation/world/detail update benchmark measured 1.23 → 0.63 ms
per frame. These are local microbenchmarks, not playback FPS.

Rerunning the same Chromium benchmark with lazy branches measured the following
against the saved pre-change run above (separate runs, same scene/poses/skins):

| Scene             | Native render CPU, eager → lazy | Shared render CPU, eager → lazy |
| ----------------- | ------------------------------: | ------------------------------: |
| Massive recording |                 12.40 → 9.61 ms |                13.41 → 10.40 ms |
| 120-player crowd  |                 14.38 → 8.68 ms |                16.28 → 10.17 ms |

Draw and triangle counts remained unchanged. Comparing shared-render screenshots
against the saved pre-change images, 6 wide-view, 17 close-view and 2 crowd pixels
changed by more than 3/255 out of 921,600; no WebGL or JavaScript errors occurred.
The all-asset eager/lazy audit matched 4,325 snapshots across 345 installed DTS
files, including external animations, explicit details and enabled decals.

## Persistent registration

The persistent-registration pass was profiled over 12 seconds of active Massive
playback starting at 600 seconds, with Chrome CPU sampling enabled. Pool
preparation (prepare + flush) measured 1.49 ms/frame before and 0.86 ms/frame in
the final run; candidate classification measured 0.81 → 0.48 ms/frame. Other
unchanged phases also ran faster in that final run, so these separate-run results
do not isolate an overall FPS gain. The first intermediate comparison measured
1.33 ms/frame for pool preparation with other phases essentially unchanged.
The final run averaged 187 candidates but only 0.009 new registrations and 1.03
membership changes per frame. Changed instance attributes averaged 136 bytes
per frame; that figure excludes bone and morph textures.

The final paused comparison retained 197,378 triangles and 195 → 137 calls in
Massive, and 233,846 triangles and 600 → 10 calls in the 120-player crowd. Render
CPU time was 7.60 → 8.01 ms and 7.01 → 7.40 ms respectively for native versus
pooled draws. Instancing still has a CPU cost in these scenes. Native/pooled
pixel differences stayed at 17 wide-view, 36 close-view and 87 crowd pixels,
with no JavaScript or WebGL errors. An unchanged paused scene produced no new
registrations, membership changes or instance-attribute uploads.

## Pose helper matrices

Internal base, blend and arbitrary-scale pose helpers use native
`matrixAutoUpdate = false`. Their `DTSAnimationTransform` Bone subclass
recomposes the local matrix when Three's animation bindings mark a pose dirty.
Public named bones remain independently editable. Three still propagates world
transforms, and explicit mount/collision queries refresh the parent path before
returning. The eager/lazy asset audit also compares these helpers against native
auto-update across all 4,325 snapshots.

On the same paused Massive scene, this reduced local matrix compositions from
15,920 to 10,550 per traversal (5,370 pose helpers). Four alternating batches of
100 traversals averaged 2.48 ms with native auto-update and 2.46 ms with changed
helpers only. This is essentially unchanged timing, not evidence of an FPS gain.
`profile-dts-demo.ts` reports this isolated comparison separately from active
playback profiling.

## Lazy scene hierarchy

`DTSHierarchy` retains the authored topology once per asset and creates each
instance's named nodes, pose helpers and object controls as needed. All native
animation targets are ready before binding clips; other paths are requested by
visible geometry, skin bones, valid collision hulls or named-node lookups. Late
nodes inherit the current ancestor pose immediately, without rebinding mixers
or replaying animation. Raw DTS data and every detail remain available.

Mount, eye and jet-nozzle queries request matching paths instead of collecting
every node. Indexed `model.nodes[i]` inspection is also lazy. Full inspection can
use `scene.ensureNodes()` and `scene.getShapeObject(index)`, or build eagerly.
Rigid mesh batches keep only their referenced bones in a compact skeleton
palette; source DTS node indices no longer create unused palette entries.

In the same Massive recording at 600 seconds, the hierarchy pass reduced total
scene objects from 20,498 to 18,718 (8.7%), removing 887 named nodes, 887 pose
helpers and six unused object controls. Allocated instance bone-palette storage
fell from 112,384 to 48,128 bytes (57%). With rigid batching, `borg18` and `borg19`
each use 31 objects instead of 48, `light_male` 154 instead of 166, and
`weapon_energy` 47 instead of 53, with unchanged mesh counts.

Active-playback world-matrix work measured 4.22 → 3.97 ms/frame in separate
12-second Chromium runs. This is a modest timing improvement, not evidence of
a large FPS gain. The all-asset audit still matches 4,325 geometry/pose snapshots
across 345 assets, and the rigid-batch audit checks every asset's posed vertices
and normals with the compact palettes. Regression tests cover native animation
bindings, cloned and late nodes, duplicate names, mounts, collision queries and
both GPU and CPU skinning after late detail activation.

The 27 asset rendering cases and the Massive/120-player crowd comparisons keep
the same triangle counts, with no JavaScript or WebGL errors. Saved pooled
images for all nine assets and all three demo/crowd views match the preceding
pass at the 3/255 pixel threshold. The complete unit suite passes 1,262 tests.

## Reusing unchanged setup

DTS updates read the camera matrix already prepared by Three, avoiding a camera
and ancestor update for every shape. As with native `LOD.update`, standalone
callers must update the camera's world matrix before calling `shape.update` or
`shape.selectDetail`. Sorted meshes retain their inverse world matrix until the
mesh moves, and retain their polygon order while the camera position and mesh
frame also remain unchanged. Camera movement still selects the appropriate
authored sorting path.

Each instance's pending branch sets drop meshes after creation. Subsequent
updates inspect only branches that may still need to appear, such as damage
decals. Only requested details allocate these sets; the immutable branch layout
stays shared. Cloning reconstructs pending work independently from the retained
descriptors and the clone's already-created branches. Set iteration also allows
mesh-initialization callbacks to request details recursively.

In separate 12-second Massive runs at 600 seconds, DTS update work measured
1.62 → 1.33 ms/frame, with total frame time changing from 17.80 → 17.34 ms.
The end-to-end improvement is modest and these are separate headless runs.
World-transform traversal remains native: a
broader cache that checked every editable scene object's state cost more than
it saved and was discarded. The complete suite passes 1,264 tests, and the
345-asset audit still matches all 4,325 geometry/pose snapshots.
Saved images for all nine asset views and the three Massive/crowd views match
the preceding pass at the 3/255 pixel threshold, with no JavaScript or WebGL errors.

## Active-match profiling

The Massive recording's match starts at 1006.432 seconds (16:46). The earlier
600-second comparisons were before the match; they remain useful for comparing
those changes, but do not represent combat performance. The playback profiler
now defaults to 1500 seconds (25:00), verifies that seeking completed, and records
match state, frame percentiles, long tasks, approximate heap usage and separate
main-scene/extra-pass CPU timings. `DTS_WAIT_TIMELINE=1` waits for the background
timeline scan, and `DTS_ALLOCATIONS=1` adds a separate sampled allocation profile.

A 30-second run at 25:00 after the timeline scan finished averaged 71.15 ms/frame
(about 14 FPS), with a 108.3 ms 95th percentile and a 200 ms maximum. Main-scene
rendering averaged 30.82 ms, including 12.44 ms propagating world transforms.
DTS updates took 3.71 ms and animation 2.39 ms per main render; these timings
overlap other measured work and should not be added together. The scene contained
39,908 objects, compared with 18,718 at 10:00. No JavaScript or WebGL errors occurred.

`EntityLayer` consumed about 6.04 seconds of the 31.08-second CPU profile, mostly
creating React elements for the full entity list whenever membership changes.
A separate allocation sample also showed substantial temporary arrays from
React Three Fiber's frame-callback registration/removal as components mount and
unmount. These make component/lifecycle churn a better next target than parsing:
`parseDTS` accounted for only 2.2 ms in the settled profile. Native scene traversal
remains another major cost. An earlier sample included a 475 ms frame near a
shader's first-use validation stall; garbage collection also contributed pauses.
These are instrumented, headless development measurements, not GPU timings or
production-build guarantees. This profiling pass changed no runtime code.

## Pooled projectile lifecycles

`EntityScene` mounts one persistent `Projectiles` component. Its two frame
callbacks acquire/release native Three views before shape animation and update
camera-facing effects after the camera settles. Projectiles and explosions stay
in the canonical game entity store, but their membership no longer rebuilds the
React scene list. Views cover DTS shapes, sprites, tracers, flares, sniper and
link beams, shocklance effects, and explosions; the old component renderers have
been removed.

The pool groups views by shape/material/effect configuration and reuses their
geometry, materials, mixers, and buffers. Idle views detach from the scene so
Three does not traverse them; at most 128 idle views are retained. Release clears
lights and borrowed zap overlays. Reacquisition resets animation, trails, and
effect clocks, and applies the current interpolation immediately. Seeks reset
active views; recording, mission, and source changes dispose the pool. Pending
asset loads cannot resurrect removed entities. `ShapeLoader` shares parsed
sources between imperative requests, React loaders, and prefetch, and evicts
failed source requests so they can retry.

DTS geometry still uses the existing animated GPU instance pool. This lifecycle
change does not additionally batch the sprite/ribbon draw calls or replace
Three's world-transform traversal.

The same settled 30-second Massive segment at 25:00 measured:

| Metric                       | Per-projectile components | Pooled views |
| ---------------------------- | ------------------------: | -----------: |
| Mean frame time              |                  71.15 ms |     53.21 ms |
| 95th percentile              |                  108.3 ms |      75.1 ms |
| Maximum frame time           |                    200 ms |     166.6 ms |
| EntityLayer sampled CPU time |                    6.04 s |       2.02 s |
| Main-scene render CPU/frame  |                  30.82 ms |     30.15 ms |
| World-transform CPU/frame    |                  12.44 ms |     12.51 ms |

Pool synchronization, acquisition/animation, and effect updates together averaged
0.51 ms/frame. The runs covered the same combat interval with the timeline scan
finished and no JavaScript or WebGL errors. These remain separate instrumented
headless development runs. Rendering/traversal and remaining persistent-entity
React work are still substantial.

Validation: 1,275 tests pass, including reuse, removal during loading, bounded
storage, animation transitions, pause/reset, shared-geometry ownership and source
load deduplication/retry. Forty old/new effect snapshots matched after correcting
beam texture wrapping. The retained browser check compares 48 fresh/recycled
snapshots, also including animated discs and flare spikes; all matched at the
3/255 pixel threshold with identical triangle counts and no rendering errors.

## Reproduce

Use the existing development server on port 3000:

```sh
node --import=tsx scripts/compare-dts-instances.ts \
  https://demos.tribes2.online/demos/the-cut-back-to-ymir_20260906T0129_s5-massive_2b28bf.rec \
  /private/tmp/dts-instances-comparison 1500
node --import=tsx scripts/check-dts-instances.ts /private/tmp/dts-shape-comparison
```

For CPU timings and an all-asset geometry/pose comparison:

```sh
node --import=tsx scripts/benchmark-dts.ts light_male vehicle_air_scout borg18 weapon_energy
node --import=tsx scripts/check-dts-lazy.ts
node --import=tsx scripts/check-projectile-views.ts /private/tmp/projectile-views
DTS_WAIT_TIMELINE=1 node --import=tsx scripts/profile-dts-demo.ts \
  https://demos.tribes2.online/demos/the-cut-back-to-ymir_20260906T0129_s5-massive_2b28bf.rec \
  /private/tmp/dts-playback-profile 1500 30
```

Set `DTS_PROFILE=1` on the comparison command to save a Chrome CPU profile.
Both scripts save JSON metrics and before/after PNGs. The comparison explicitly
disables the app-owned pool and installs its own adapter for A/B measurements.
