# Tribes 2 Engine Fog System

This document describes the fog rendering system used in Tribes 2 (based on the V12/Torque engine circa 2001). It provides enough detail to reimplement the system in another renderer such as Three.js.

**Important Note**: The version of Torque used by Tribes 2 does **NOT** use `fogDensity` or the later `VolumetricFog` object. Instead, it uses a combination of distance-based "haze" and height-based "fog volumes."

## Table of Contents

1. [Overview](#overview)
2. [Mission File Parameters](#mission-file-parameters)
3. [Haze (Distance-Based Fog)](#haze-distance-based-fog)
4. [Fog Volumes (Height-Based Fog)](#fog-volumes-height-based-fog)
5. [Combined Fog Calculation](#combined-fog-calculation)
6. [Fog Application by Object Type](#fog-application-by-object-type)
7. [The Fog Texture](#the-fog-texture)
8. [Three.js Implementation Guide](#threejs-implementation-guide)
9. [Additional Notes](#additional-notes)
   - [Sky Fog Bans (Horizon Fog Gradient)](#sky-fog-bans-horizon-fog-gradient)
   - [Storm Fog](#storm-fog)
   - [Visibility Distance Modifier](#visibility-distance-modifier-smvisibledistancemod)
   - [Object Culling](#object-culling)
10. [The `$specialFog` Console Variable](#the-specialfog-console-variable)

---

## Overview

The Tribes 2 fog system has two independent components that are combined:

1. **Haze**: Distance-based fog with a quadratic falloff curve. Applies uniformly regardless of height.
2. **Fog Volumes**: Up to three height-bounded fog layers that add additional fog based on how much of the ray from camera to object passes through each volume.

The final fog value is the sum of haze and fog volume contributions, clamped to [0, 1].

---

## Mission File Parameters

These parameters are defined on the `Sky` object in `.mis` files:

### Core Parameters

| Parameter         | Type          | Description                                                                 |
| ----------------- | ------------- | --------------------------------------------------------------------------- |
| `visibleDistance` | Float         | Maximum view distance in world units. Objects beyond this are fully fogged. |
| `fogDistance`     | Float         | Distance where fog begins. No fog closer than this.                         |
| `fogColor`        | ColorF (RGBA) | Color of the distance-based haze (0.0-1.0 per channel).                     |

### Fog Volume Parameters

Each volume is defined by two fields:

| Parameter         | Type    | Description                                            |
| ----------------- | ------- | ------------------------------------------------------ |
| `fogVolume1`      | Point3F | `(visibleDistance, minHeight, maxHeight)` for volume 1 |
| `fogVolume2`      | Point3F | `(visibleDistance, minHeight, maxHeight)` for volume 2 |
| `fogVolume3`      | Point3F | `(visibleDistance, minHeight, maxHeight)` for volume 3 |
| `fogVolumeColor1` | ColorF  | Color for fog volume 1 **(see note below)**            |
| `fogVolumeColor2` | ColorF  | Color for fog volume 2 **(see note below)**            |
| `fogVolumeColor3` | ColorF  | Color for fog volume 3 **(see note below)**            |

> **⚠️ IMPORTANT: Per-Volume Colors Are Ignored by Default**
>
> Despite being defined in mission files, `fogVolumeColor1/2/3` are **NOT used** by the
> default renderer. The engine has two fog texture building code paths controlled by the
> `$specialFog` console variable (which maps to `SceneGraph::useSpecial`):
>
> - `useSpecial = false` (default): Uses `buildFogTexture()` which **ignores per-volume colors**
>   and only uses the global `fogColor` for all fog rendering.
> - `useSpecial = true`: Uses `buildFogTextureSpecial()` which **blends per-volume colors**
>   based on camera height and distance.
>
> Since `$specialFog` defaults to `false` and is never enabled by Tribes 2 game scripts,
> the per-volume colors are loaded from mission files but have no effect on rendering.
> All fog (both haze and fog volumes) is rendered using the global `fogColor`.
>
> See [The `$specialFog` Console Variable](#the-specialfog-console-variable) for details.

### Example from Tribes 2 Mission (BeggarsRun.mis)

```
new Sky(Sky) {
    visibleDistance = "500";
    fogDistance = "225";
    fogColor = "0.257800 0.125000 0.097700 1.000000";
    fogVolume1 = "500 1 300";      // visDist=500, minHeight=1, maxHeight=300
    fogVolume2 = "1000 301 500";   // visDist=1000, minHeight=301, maxHeight=500
    fogVolume3 = "17000 501 1000"; // visDist=17000, minHeight=501, maxHeight=1000
    fogVolumeColor1 = "128.000000 128.000000 128.000000 0.000000";
    fogVolumeColor2 = "128.000000 128.000000 128.000000 0.000000";
    fogVolumeColor3 = "128.000000 128.000000 128.000000 0.000000";
};
```

Note that the `fogVolumeColor` values above use 0-255 range instead of the expected 0-1 range for `TypeColorF`. Many community maps have similar issues, sometimes with garbage alpha values from uninitialized memory. Since per-volume colors are unused by default (see [`$specialFog`](#the-specialfog-console-variable)), this has no visual effect.

---

## Haze (Distance-Based Fog)

Haze is a simple distance-based fog with a **quadratic** falloff curve. It creates a smooth transition from clear visibility to full fog.

### Algorithm

```cpp
// From sceneState.h:247-256
inline F32 SceneState::getHaze(F32 dist)
{
   // No fog if distance is less than fogDistance
   if (dist <= mFogDistance)
      return 0;

   // Full fog beyond visibleDistance
   if (dist > mVisibleDistance)
      return 1.0;

   // Quadratic falloff between fogDistance and visibleDistance
   F32 fogScale = 1.0 / (mVisibleDistance - mFogDistance);
   F32 distFactor = (dist - mFogDistance) * fogScale - 1.0;
   return 1.0 - distFactor * distFactor;
}
```

### Explanation

1. If `dist <= fogDistance`: No haze (return 0)
2. If `dist > visibleDistance`: Full haze (return 1)
3. Otherwise: Apply quadratic curve

The formula `1.0 - (distFactor)^2` where `distFactor = (dist - fogDistance) / (visibleDistance - fogDistance) - 1.0` creates an **inverted parabola** that:

- Starts at 0 when dist = fogDistance
- Reaches 1 when dist = visibleDistance
- Has a smooth acceleration (slow at first, faster later)

### Visualization

```
Haze
1.0 |                    *****
    |                 ***
    |               **
    |             **
    |           **
    |         **
    |       **
    |     **
0.0 |****
    +-------------------------->
    0    fogDist    visibleDist    Distance
```

### JavaScript Implementation

```javascript
function getHaze(dist, fogDistance, visibleDistance) {
  if (dist <= fogDistance) return 0;
  if (dist > visibleDistance) return 1;

  const fogScale = 1.0 / (visibleDistance - fogDistance);
  const distFactor = (dist - fogDistance) * fogScale - 1.0;
  return 1.0 - distFactor * distFactor;
}
```

---

## Fog Volumes (Height-Based Fog)

Fog volumes are horizontal fog layers that exist between specified height ranges. Each volume has its own visibility distance and color.

### Data Structures

```cpp
struct FogVolume {
    float visibleDistance;  // Visibility within this fog layer
    float minHeight;        // Bottom of fog layer (world Z)
    float maxHeight;        // Top of fog layer (world Z)
    float percentage;       // Fog intensity multiplier (default 1.0)
    ColorF color;           // Fog color (RGBA)
};

// Maximum of 3 fog volumes
const int MaxFogVolumes = 3;
```

### Fog Band Processing

The engine pre-processes fog volumes into "fog bands" relative to the camera's height. This creates two lists:

- **Positive fog bands**: For points above the camera
- **Negative fog bands**: For points below the camera

Each band stores:

```cpp
struct FogBand {
    bool isFog;     // true if this is a fog volume, false if clear air
    float cap;      // Height extent of this band
    float factor;   // Fog factor = (1 / (visibleDistance * visFactor)) * percentage
    ColorF color;   // Band color
};
```

### Setup Algorithm

The setup happens each frame in `SceneState::setupFog()`:

```cpp
void SceneState::setupFog()
{
    // Calculate fog scale for haze
    if (mVisibleDistance == mFogDistance) {
        mFogScale = 1000.0f;  // Arbitrary large constant
    } else {
        mFogScale = 1.0 / (mVisibleDistance - mFogDistance);
    }

    // Build positive fog bands (above camera)
    mPosFogBands.clear();
    float camZ = mCamPosition.z;

    // Find first fog volume above or containing camera
    int i;
    for (i = 0; i < mNumFogVolumes; i++) {
        if (camZ < mFogVolumes[i].maxHeight)
            break;
    }

    if (i < mNumFogVolumes) {
        float prevHeight = camZ;
        for (; i < mNumFogVolumes; i++) {
            // Add clear band if there's a gap before this fog volume
            if (prevHeight < mFogVolumes[i].minHeight) {
                FogBand fb;
                fb.isFog = false;
                fb.cap = mFogVolumes[i].minHeight - prevHeight;
                fb.color = mFogVolumes[i].color;
                prevHeight = mFogVolumes[i].minHeight;
                mPosFogBands.push_back(fb);
            }

            // Add fog band for this volume
            FogBand fb;
            fb.isFog = true;
            fb.cap = mFogVolumes[i].maxHeight - prevHeight;
            fb.factor = (1 / (mFogVolumes[i].visibleDistance * mVisFactor))
                        * mFogVolumes[i].percentage;
            fb.color = mFogVolumes[i].color;
            prevHeight = mFogVolumes[i].maxHeight;
            mPosFogBands.push_back(fb);
        }
    }

    // Similar logic for negative fog bands (below camera)
    // ... (traverses volumes in reverse order)
}
```

### Ray-Marching Through Fog Bands

When calculating fog for a point, the engine traces a ray from the camera to the point and accumulates fog through each band it passes:

```cpp
F32 SceneState::getFog(float dist, float deltaZ)
{
    float haze = 0;
    Vector<FogBand> *band;

    // Choose band list based on direction
    if (deltaZ < 0) {
        deltaZ = -deltaZ;
        band = &mNegFogBands;
    } else {
        band = &mPosFogBands;
    }

    float ht = deltaZ;  // Remaining height to traverse

    for (int i = 0; i < band->size(); i++) {
        FogBand &bnd = (*band)[i];

        if (ht < bnd.cap) {
            // Ray ends within this band
            if (bnd.isFog)
                haze += dist * bnd.factor;
            break;
        }

        // Ray passes through entire band
        // Calculate distance traveled in this band using similar triangles
        float subDist = dist * bnd.cap / ht;
        if (bnd.isFog)
            haze += subDist * bnd.factor;
        dist -= subDist;
        ht -= bnd.cap;
    }

    return haze;
}
```

### Key Insight: Similar Triangles

The fog calculation uses similar triangles to determine how much distance the ray travels through each height band:

```
Camera -------- dist --------> Point
   |                            |
   |                            |
   ht (total deltaZ)            |
   |                            |
   v                            v

For a band of height 'cap':
    subDist / dist = cap / ht
    subDist = dist * cap / ht
```

---

## Combined Fog Calculation

The main function `getHazeAndFog()` combines both haze and fog volumes:

```cpp
F32 SceneState::getHazeAndFog(float dist, float deltaZ)
{
    float haze = 0;

    // Calculate distance-based haze
    if (dist > mFogDistance) {
        if (dist > mVisibleDistance)
            return 1.0;

        float distFactor = (dist - mFogDistance) * mFogScale - 1.0;
        haze = 1.0 - distFactor * distFactor;
    }

    // Add height-based fog from fog volumes
    Vector<FogBand> *band;
    if (deltaZ < 0) {
        deltaZ = -deltaZ;
        band = &mNegFogBands;
    } else {
        band = &mPosFogBands;
    }

    float ht = deltaZ;
    for (int i = 0; i < band->size(); i++) {
        FogBand &bnd = (*band)[i];

        if (ht < bnd.cap) {
            if (bnd.isFog)
                haze += dist * bnd.factor;
            break;
        }
        float subDist = dist * bnd.cap / ht;
        if (bnd.isFog)
            haze += subDist * bnd.factor;
        dist -= subDist;
        ht -= bnd.cap;
    }

    // Clamp to [0, 1]
    if (haze > 1)
        return 1;
    return haze;
}
```

### Critical Implementation Note: Parameter Separation

**IMPORTANT**: Notice that haze uses `mFogDistance` and `mVisibleDistance` (global parameters), while fog bands use their own per-volume `visibleDistance` in the factor calculation.

When implementing in Three.js or other engines:

1. **Haze** must use global `fogDistance` and `visibleDistance`
2. **Fog volumes** use their own per-volume `visibleDistance` for factor calculation
3. These are ADDED together, not blended

A common mistake is to adjust the haze near/far values based on which fog volume the camera is in. This is incorrect - the haze always uses global parameters regardless of camera height.

---

## Fog Application by Object Type

Different object types apply fog differently:

### 1. Terrain

Terrain uses a pre-computed **fog texture** (64x64 RGBA). Each vertex samples this texture to get its fog value.

```cpp
// From terrRender.cc - allocating terrain points
ChunkCornerPoint *TerrainRender::allocPoint(Point2I pos)
{
    ChunkCornerPoint *ret = /* allocate */;
    ret->x = pos.x * mSquareSize + mBlockPos.x;
    ret->y = pos.y * mSquareSize + mBlockPos.y;
    ret->z = fixedToFloat(mCurrentBlock->getHeight(pos.x, pos.y));
    ret->distance = (*ret - mCamPos).len();

    // Get fog texture coordinates for this vertex
    gClientSceneGraph->getFogCoordPair(ret->distance, ret->z,
                                        ret->fogRed, ret->fogGreen);
    return ret;
}
```

The fog texture coordinates are computed as:

```cpp
inline void SceneGraph::getFogCoordPair(F32 dist, F32 z, F32 &x, F32 &y)
{
    x = (getVisibleDistanceMod() - dist) * mInvVisibleDistance;
    y = (z - mHeightOffset) * mInvHeightRange;
}
```

### 2. Shapes (TSShapeInstance)

Shapes use **textured fogging** - a single uniform fog value for the entire shape, computed at the shape's center.

From the GarageGames forum:

> "TS instances use textured fogging. Textured fogging calculates a single fog value based on the TS object's location, and uses that for the whole thing."

The fog value is obtained via:

```cpp
float fogValue = state->getHazeAndFog(distance, height_difference);
```

This value is then used to blend the shape's color with the fog color.

### 3. Interiors

Interiors use **vertex-based fogging** - fog is calculated per-vertex.

From the GarageGames forum:

> "Interiors use the vertex fog. Each vertex has a fog value placed into it during the render prep phase."

---

## The Fog Texture

The engine builds a 64x64 RGBA texture that encodes fog values based on distance and height. This is rebuilt each frame.

### Texture Layout

- **U-axis (horizontal)**: Distance from `visibleDistance` (left, u=0) to 0 (right, u=1)
- **V-axis (vertical)**: Height from terrain minimum (bottom, v=0) to terrain maximum (top, v=1)
- **Alpha channel**: Fog amount (0-255)
- **RGB channels**: Fog color

### Building the Fog Texture

```cpp
void SceneGraph::buildFogTexture(SceneState *pState)
{
    const Point3F &cp = pState->getCameraPosition();

    // Create texture if needed
    if (!bool(mFogTexture)) {
        mFogTexture = TextureHandle(NULL,
            new GBitmap(64, 64, false, GBitmap::RGBA), true);
    }

    TerrainBlock *block = getCurrentTerrain();
    if (block) {
        GridSquare *sq = block->findSquare(TerrainBlock::BlockShift, Point2I(0,0));
        F32 heightRange = fixedToFloat(sq->maxHeight - sq->minHeight);
        mHeightOffset = fixedToFloat(sq->minHeight);

        mInvHeightRange = 1 / heightRange;
        mInvVisibleDistance = 1 / getVisibleDistanceMod();

        GBitmap *fogBitmap = mFogTexture.getBitmap();
        F32 heightStep = heightRange / F32(fogBitmap->getHeight());

        // Distance starts at visibleDistance (inset by half texel)
        F32 distStart = getVisibleDistanceMod() -
                        (getVisibleDistanceMod() / (fogBitmap->getWidth() * 2));
        ColorI fogColor(mFogColor);

        // Pre-compute haze values for each distance column
        if (mHazeArrayDirty) {
            F32 distStep = -getVisibleDistanceMod() / F32(fogBitmap->getWidth());
            F32 dist = distStart;
            for (U32 i = 0; i < FogTextureDistSize; i++) {
                mHazeArray[i] = pState->getHaze(dist);
                F32 prevDist = dist;
                dist += distStep;
                mDistArray[i] = dist / prevDist;
            }
            mHazeArrayDirty = false;
        }

        // Build texture row by row (each row = different height)
        F32 ht = mHeightOffset + (heightStep / 2) - cp.z;  // Delta-Z from camera
        U32 fc = *((U32 *)&fogColor) & 0x00FFFFFF;  // RGB only

        for (U32 j = 0; j < fogBitmap->getHeight(); j++) {
            F32 dist = distStart;
            U32 *ptr = (U32 *)fogBitmap->getAddress(0, j);

            // Get initial fog value for this height
            F32 fogStart = pState->getFog(dist, ht);

            for (U32 i = 0; i < fogBitmap->getWidth(); i++) {
                // Combine fog volume contribution with haze
                U32 fog = (fogStart + mHazeArray[i]) * 255;
                fogStart *= mDistArray[i];  // Scale fog for shorter distance
                if (fog > 255)
                    fog = 255;
                *ptr++ = fc | (fog << 24);  // RGB | Alpha
            }
            ht += heightStep;
        }
        mFogTexture.refresh();
    }
}
```

---

## Three.js Implementation Guide

### Approach 1: Shader-Based (Recommended)

Implement fog calculation in a custom shader:

```glsl
// Vertex shader
varying float vFogFactor;

uniform vec3 cameraPosition;
uniform float fogDistance;
uniform float visibleDistance;
uniform int numFogVolumes;
uniform vec3 fogVolumes[3];  // (visibleDistance, minHeight, maxHeight)
uniform float fogPercentages[3];

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    float dist = length(worldPos.xyz - cameraPosition);
    float deltaZ = worldPos.z - cameraPosition.z;

    // Calculate haze (distance-based fog)
    float haze = 0.0;
    if (dist > fogDistance && dist <= visibleDistance) {
        float fogScale = 1.0 / (visibleDistance - fogDistance);
        float distFactor = (dist - fogDistance) * fogScale - 1.0;
        haze = 1.0 - distFactor * distFactor;
    } else if (dist > visibleDistance) {
        haze = 1.0;
    }

    // Calculate fog volume contribution
    float volumeFog = calculateFogVolumes(dist, deltaZ,
                                          cameraPosition.z,
                                          numFogVolumes,
                                          fogVolumes,
                                          fogPercentages);

    vFogFactor = clamp(haze + volumeFog, 0.0, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// Fragment shader
varying float vFogFactor;
uniform vec3 fogColor;

void main() {
    vec3 color = /* your base color calculation */;
    gl_FragColor = vec4(mix(color, fogColor, vFogFactor), 1.0);
}
```

### Approach 2: Three.js FogExp2 Approximation

For a quick approximation, you could use Three.js's built-in fog, but note it won't match exactly:

```javascript
// This is NOT an exact match but gives similar visual results
scene.fog = new THREE.Fog(fogColor, fogDistance, visibleDistance);
```

However, Three.js uses **linear** interpolation between near and far, while Tribes 2 uses **quadratic**. For accurate results, you need a custom shader.

### JavaScript Helper Functions

```javascript
// Haze calculation (distance-based fog)
function getHaze(dist, fogDistance, visibleDistance) {
  if (dist <= fogDistance) return 0;
  if (dist > visibleDistance) return 1;

  const fogScale = 1.0 / (visibleDistance - fogDistance);
  const distFactor = (dist - fogDistance) * fogScale - 1.0;
  return 1.0 - distFactor * distFactor;
}

// Fog volume structure
class FogVolume {
  constructor(
    visibleDistance,
    minHeight,
    maxHeight,
    percentage = 1.0,
    color = null,
  ) {
    this.visibleDistance = visibleDistance;
    this.minHeight = minHeight;
    this.maxHeight = maxHeight;
    this.percentage = percentage;
    this.color = color;
  }
}

// Fog band structure (precomputed relative to camera)
class FogBand {
  constructor(isFog, cap, factor, color) {
    this.isFog = isFog;
    this.cap = cap; // Height extent
    this.factor = factor; // Fog strength
    this.color = color;
  }
}

// Build fog bands for a given camera height
// Note: visibilityFactor defaults to 1.0 (full quality) matching Torque's smVisibleDistanceMod default
function setupFogBands(cameraZ, fogVolumes, visibilityFactor = 1.0) {
  const posBands = [];
  const negBands = [];

  // Sort volumes by minHeight
  const sortedVolumes = [...fogVolumes].sort(
    (a, b) => a.minHeight - b.minHeight,
  );

  // Build positive bands (above camera)
  let startIdx = sortedVolumes.findIndex((v) => cameraZ < v.maxHeight);
  if (startIdx >= 0) {
    let prevHeight = cameraZ;
    for (let i = startIdx; i < sortedVolumes.length; i++) {
      const vol = sortedVolumes[i];

      // Add clear band if gap exists
      if (prevHeight < vol.minHeight) {
        posBands.push(
          new FogBand(false, vol.minHeight - prevHeight, 0, vol.color),
        );
        prevHeight = vol.minHeight;
      }

      // Add fog band
      // factor = (1 / (volumeVisDist * visFactor)) * percentage
      // where visFactor = smVisibleDistanceMod (default 1.0)
      const factor =
        (1 / (vol.visibleDistance * visibilityFactor)) * vol.percentage;
      posBands.push(
        new FogBand(true, vol.maxHeight - prevHeight, factor, vol.color),
      );
      prevHeight = vol.maxHeight;
    }
  }

  // Build negative bands (below camera) - traverse in reverse
  startIdx = sortedVolumes.findLastIndex((v) => cameraZ > v.minHeight);
  if (startIdx >= 0) {
    let prevHeight = cameraZ;
    for (let i = startIdx; i >= 0; i--) {
      const vol = sortedVolumes[i];

      // Add clear band if gap exists
      if (prevHeight > vol.maxHeight) {
        negBands.push(
          new FogBand(false, prevHeight - vol.maxHeight, 0, vol.color),
        );
        prevHeight = vol.maxHeight;
      }

      // Add fog band
      const factor =
        (1 / (vol.visibleDistance * visibilityFactor)) * vol.percentage;
      negBands.push(
        new FogBand(true, prevHeight - vol.minHeight, factor, vol.color),
      );
      prevHeight = vol.minHeight;
    }
  }

  return { posBands, negBands };
}

// Calculate fog from volumes using fog bands
function getFogFromBands(dist, deltaZ, bands) {
  let fog = 0;
  const isNegative = deltaZ < 0;
  const bandList = isNegative ? bands.negBands : bands.posBands;
  deltaZ = Math.abs(deltaZ);

  let remainingHeight = deltaZ;
  let remainingDist = dist;

  for (const band of bandList) {
    if (remainingHeight < band.cap) {
      // Ray ends within this band
      if (band.isFog) {
        fog += remainingDist * band.factor;
      }
      break;
    }

    // Ray passes through entire band
    const subDist = (remainingDist * band.cap) / remainingHeight;
    if (band.isFog) {
      fog += subDist * band.factor;
    }
    remainingDist -= subDist;
    remainingHeight -= band.cap;
  }

  return fog;
}

// Complete fog calculation
function getHazeAndFog(dist, deltaZ, fogDistance, visibleDistance, fogBands) {
  const haze = getHaze(dist, fogDistance, visibleDistance);

  if (haze >= 1.0) return 1.0;

  const volumeFog = getFogFromBands(dist, deltaZ, fogBands);

  return Math.min(1.0, haze + volumeFog);
}
```

### Usage Example

```javascript
// Parse mission file parameters
const fogDistance = 225;
const visibleDistance = 500;
const fogColor = new THREE.Color(0.258, 0.125, 0.098);

const fogVolumes = [
  new FogVolume(500, 1, 300),
  new FogVolume(1000, 301, 500),
  new FogVolume(17000, 501, 1000),
];

// In render loop
function animate() {
  const cameraZ = camera.position.z;
  const fogBands = setupFogBands(cameraZ, fogVolumes);

  // For each object or vertex
  const objectPos = new THREE.Vector3(/* ... */);
  const dist = camera.position.distanceTo(objectPos);
  const deltaZ = objectPos.z - camera.position.z;

  const fogFactor = getHazeAndFog(
    dist,
    deltaZ,
    fogDistance,
    visibleDistance,
    fogBands,
  );

  // Apply fog to object color
  // objectColor.lerp(fogColor, fogFactor);
}
```

---

## Additional Notes

### Sky Fog Bans (Horizon Fog Gradient)

The Sky object renders "bans" (fog bands) directly onto the sky to create a smooth fog-to-sky gradient at the horizon. This is controlled by the `noRenderBans` property (default: false).

#### How Sky Fog Bans Work

When the camera is NOT inside a fog volume, the engine renders fog bands as geometry overlaid on the skybox:

```cpp
// sky.cc - Key constants
#define HORIZON 0.0f       // Base height of lower fog band
#define OFFSET_HEIGHT 60.0f // Height of fog band above horizon (world units)
```

The fog bands are positioned relative to the skybox geometry:

```cpp
// sky.cc:1137-1149 - Skybox corner calculation
// mRadius = visibleDistance * 0.95
// tpt = (1,1,1).normalize(mRadius) -> each component = mRadius / sqrt(3)
// mSkyBoxPt.x = mSkyBoxPt.z = mRadius / sqrt(3)
```

For a mission with `visibleDistance = 600`:

- `mRadius = 600 * 0.95 = 570`
- `mSkyBoxPt.x = 570 / sqrt(3) ≈ 329` (skybox corner coordinate)

The fog band geometry spans from height 0 (`HORIZON`) to height 60 (`OFFSET_HEIGHT`) at the skybox distance. This creates a narrow fog gradient just above the terrain horizon.

#### Fog Ban Alpha Values

When NOT in a fog volume (`depthInFog <= 0`):

```cpp
banHeights[0] = HORIZON;           // 0.0 - lower band at horizon
banHeights[1] = OFFSET_HEIGHT;     // 60.0 - upper band
alphaBan[0] = 0.0;                 // Upper band edge is fully transparent
alphaBan[1] = 0.0;                 // Center top is fully transparent
```

The fog bands render as triangle strips with linear vertex alpha interpolation:

- Lower vertices (at horizon): full fog color (alpha = 1.0)
- Upper vertices (at OFFSET_HEIGHT): transparent (alpha = 0.0)

This creates a gradient from solid fog color at the horizon to clear sky above.

#### Three.js Implementation

For a fullscreen sky shader, convert the height-based fog band to a direction-based calculation:

```glsl
// Calculate the direction.y value where fog band ends
// horizonFogHeight = OFFSET_HEIGHT / sqrt(skyBoxPtX^2 + OFFSET_HEIGHT^2)
// For visibleDistance=600: horizonFogHeight ≈ 0.18

uniform float horizonFogHeight;

float baseFogFactor;
if (direction.y <= 0.0) {
  // At or below horizon: full fog
  baseFogFactor = 1.0;
} else if (direction.y >= horizonFogHeight) {
  // Above fog band: no fog (show sky)
  baseFogFactor = 0.0;
} else {
  // Within fog band: gradient
  // Use (1-t)^2 for a gentler falloff at the top, matching Torque's appearance
  float t = direction.y / horizonFogHeight;
  baseFogFactor = (1.0 - t) * (1.0 - t);
}

vec3 finalColor = mix(skyColor.rgb, fogColor, baseFogFactor);
```

The `(1-t)²` curve approximates the visual result of Torque's linear vertex interpolation when rendered through perspective projection on curved fog band geometry.

#### Visible Distance Culling

Objects at or beyond `visibleDistance` are not rendered in Tribes 2 (see `sceneGraph.cc` where the far plane is set to `getVisibleDistanceMod()`). For Three.js implementations, discard fragments at `dist >= fogFar` in the fog shader to prevent fully-fogged geometry from appearing as silhouettes against the sky gradient:

```glsl
// In fog fragment shader
if (dist >= fogFar) {
  discard;
}
```

This ensures a seamless transition from fogged terrain to the sky's fog gradient.

### Storm Fog

The engine supports dynamic fog changes via the `stormFog` scripting method, which fades fog layers in and out over time. The `percentage` field on fog volumes is modified during storms.

### Visibility Distance Modifier (`smVisibleDistanceMod`)

The engine has a global `smVisibleDistanceMod` (range 0.5 to 1.0, default 1.0) that acts as a quality setting for draw distance. It affects fog calculation in two ways:

1. **Distance scaling**: Both `fogDistance` and `visibleDistance` are multiplied by `smVisibleDistanceMod`, reducing effective visibility on lower quality settings.

2. **Fog volume factor**: The fog factor formula uses this value:
   ```cpp
   factor = (1 / (visibleDistance * mVisFactor)) * percentage;
   ```
   where `mVisFactor = smVisibleDistanceMod`.

**Important for Three.js implementation**: Since this is a quality preference (not a ratio of visibility distances), use `visFactor = 1.0` for full quality:

```glsl
float factor = (1.0 / volVisDist) * percentage;
```

A common mistake is computing `visFactor = globalVisDist / volumeVisDist` - this is incorrect. The Torque code passes `smVisibleDistanceMod` directly to `SceneState`, not a computed ratio.

### Object Culling

Objects are culled if `getHazeAndFog()` returns 1.0 for their bounding box. The function `isBoxFogVisible()` is used for this check.

---

## The `$specialFog` Console Variable

The engine contains two separate implementations for building the fog texture, controlled by the static variable `SceneGraph::useSpecial` which is exposed as the `$specialFog` console variable.

### Declaration and Default Value

```cpp
// sceneGraph.h:128
static bool useSpecial;

// sceneGraph.cc:96
bool SceneGraph::useSpecial = false;

// gameConnection.cc:1631
Con::addVariable("specialFog", TypeBool, &SceneGraph::useSpecial);
```

### The Two Code Paths

```cpp
// sceneGraph.cc:166-169
if(!useSpecial)
   buildFogTexture( pBaseState );
else
   buildFogTextureSpecial( pBaseState );
```

### `buildFogTexture()` - Default Mode (useSpecial = false)

This is the standard fog texture builder. It computes fog values based on distance and height, but **uses only the global `mFogColor`** for the entire texture:

```cpp
// sceneGraph.cc:198-265
void SceneGraph::buildFogTexture(SceneState *pState)
{
    // ...
    ColorI fogColor(mFogColor);  // Only global fog color used
    // ...
    for (U32 j = 0; j < fogBitmap->getHeight(); j++) {
        // ...
        for (U32 i = 0; i < fogBitmap->getWidth(); i++) {
            U32 fog = (fogStart + mHazeArray[i]) * 255;
            // ...
            *ptr++ = fc | (fog << 24);  // fc = global fogColor RGB
        }
    }
}
```

Per-volume colors (`fogVolumeColor1/2/3`) are completely ignored in this path.

### `buildFogTextureSpecial()` - Special Mode (useSpecial = true)

This alternative implementation **blends per-volume fog colors** based on camera position:

```cpp
// sceneGraph.cc:282-402
void SceneGraph::buildFogTextureSpecial(SceneState *pState)
{
    // ...
    // For single fog volume - blends volume color with global fog color
    ColorI c(hazePct * ffogColor.red + bandPct * (array[0].red * 255),
             hazePct * ffogColor.green + bandPct * (array[0].green * 255),
             hazePct * ffogColor.blue + bandPct * (array[0].blue * 255),
             (hazePct + bandPct) * 255);

    // For two fog volumes - blends both volume colors with global fog color
    ColorI c(hazePct * ffogColor.red + bandPct0 * array[0].red + bandPct1 * array[1].red,
             hazePct * ffogColor.green + bandPct0 * array[0].green + bandPct1 * array[1].green,
             hazePct * ffogColor.blue + bandPct0 * array[0].blue + bandPct1 * array[1].blue,
             (hazePct + bandPct0 + bandPct1) * 255);
    // ...
}
```

The volume colors are extracted via `getFogs()` which pulls from the `FogBand` structures that were populated from `mFogVolumes[i].color` during `setupFog()`.

### Why Per-Volume Colors Don't Work in Tribes 2

1. **Default is disabled**: `SceneGraph::useSpecial` initializes to `false`
2. **Scripts never enable it**: A search of `GameData-base` shows no scripts set `$specialFog = true`
3. **Result**: The special fog path is never taken, so per-volume colors have no effect

### Enabling Per-Volume Colors

To enable per-volume fog colors, you would need to run in the game console:

```
$specialFog = true;
```

This was likely a feature that was implemented but never shipped as the default, possibly due to performance concerns or visual issues.

---

## References

- `tribes2-engine/sceneGraph/sceneState.cc` - Core fog calculation functions
- `tribes2-engine/sceneGraph/sceneGraph.cc` - Fog texture building
- `tribes2-engine/terrain/sky.cc` - Sky object and fog volume configuration
- `tribes2-engine/terrain/terrRender.cc` - Terrain fog application
- GarageGames Forum Discussion on Fog Rendering
- The Game Programmer's Guide to Torque, Chapter 8.4.5 (Fog)
