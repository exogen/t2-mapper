/**
 * Sky fog band computation — exact port of Tribes2.exe Sky::calcPoints
 * (FUN_005ad030) plus the surrounding logic in Sky::renderSkyBox
 * (FUN_005acb20).
 *
 * The engine never fogs the sky per-pixel. It paints the whole sky with
 * the fog color, draws the skybox walls clipped to z >= h0 (an
 * eye-centered height on the skybox sphere), then blends two pieces of
 * band geometry over them: a triangle strip between rings at heights h0
 * (alpha 1) and h1 (alpha0), and a fan from the h1 ring (alpha0) to the
 * sphere apex (alpha1). All heights are relative to the EYE — the sky
 * is rendered camera-centered — so the fog/sky boundary is a band on
 * the view sphere, not a world-space plane.
 */

export interface SkyFogVolumeLike {
  visibleDistance: number;
  minHeight: number;
  maxHeight: number;
  percentage: number;
}

export interface SkyFogBands {
  /** Ring height (eye-relative, on the sky sphere) below which fog is opaque. */
  h0: number;
  /** Second ring height; alpha runs 1 → alpha0 between h0 and h1. */
  h1: number;
  /** Alpha at the h1 ring. */
  alpha0: number;
  /** Alpha at the sphere apex (height = radius). */
  alpha1: number;
  /** Sky sphere radius: mSkyBoxPt component = 0.95 * visibleDistance / sqrt(3). */
  radius: number;
}

/** The engine's fixed fade-band height (0x795b60 = 60.0). */
const MIN_BAND_HEIGHT = 60;

// Single-entry memo: the sky materials and cloud layers all compute the
// bands each frame with identical inputs (fogVolumes is a stable array
// ref per fog state), so repeat calls within a frame are cache hits.
let memoVis = NaN;
let memoVolumes: readonly SkyFogVolumeLike[] | null = null;
let memoCamHeight = NaN;
let memoResult: SkyFogBands | null = null;

/**
 * Mirror of Sky::calcPoints (0x5ad030) + the depth<=0 shortcut in
 * renderSkyBox. cameraHeight is world up-axis (Torque z = our y).
 * The returned object may be memo-shared — callers must not mutate it.
 */
export function computeSkyFogBands(
  visibleDistance: number,
  fogVolumes: readonly SkyFogVolumeLike[],
  cameraHeight: number,
): SkyFogBands {
  if (
    memoResult !== null &&
    visibleDistance === memoVis &&
    fogVolumes === memoVolumes &&
    cameraHeight === memoCamHeight
  ) {
    return memoResult;
  }
  const result = calcBands(visibleDistance, fogVolumes, cameraHeight);
  memoVis = visibleDistance;
  memoVolumes = fogVolumes;
  memoCamHeight = cameraHeight;
  memoResult = result;
  return result;
}

function calcBands(
  visibleDistance: number,
  fogVolumes: readonly SkyFogVolumeLike[],
  cameraHeight: number,
): SkyFogBands {
  // Sky::calcPoints geometry (0x5ae310): mRadius = 0.95 * visibleDistance,
  // mSkyBoxPt = (1,1,1) normalized to mRadius → each component p; the
  // "cap" height compared against is normalize((p,0,p)) to length p → p/√2.
  const p = (0.95 * visibleDistance) / Math.sqrt(3);
  const cap = p / Math.SQRT2;

  // The engine counts a LEADING prefix of volumes with visDist > 0
  // (Sky::onAdd, 0x5aa9b0); missions list volumes contiguously, so
  // skipping inactive volumes is equivalent for real content.
  // Fog top = max volume maxHeight (Sky+0xe94, set in 0x5ae310).
  let firstActive = -1;
  let lastActive = -1;
  let fogTop = 0;
  for (let i = 0; i < fogVolumes.length; i++) {
    const v = fogVolumes[i];
    if (v.visibleDistance <= 0) continue;
    if (firstActive < 0) firstActive = i;
    lastActive = i;
    fogTop = Math.max(fogTop, v.maxHeight);
  }
  const depth = fogTop - cameraHeight;

  if (firstActive < 0 || depth <= 0) {
    // Above the fog (or no volumes): opaque fog line at eye level
    // fading out over the fixed 60-unit band. (renderSkyBox 0x5acb20:
    // heights (0, 60), alphas (0, 0); the strip's lower ring alpha is
    // hardcoded opaque.)
    return { h0: 0, h1: MIN_BAND_HEIGHT, alpha0: 0, alpha1: 0, radius: p };
  }

  // Effective visibility: the last volume's, reduced by denser volumes
  // stacked below the fog top (loop over all active volumes before it).
  const lastVis = fogVolumes[lastActive].visibleDistance;
  let effVis = lastVis;
  for (let i = 0; i < lastActive; i++) {
    const v = fogVolumes[i];
    if (v.visibleDistance <= 0) continue;
    if (v.visibleDistance < lastVis) {
      const hIn =
        cameraHeight < v.minHeight
          ? v.maxHeight - v.minHeight
          : v.maxHeight - cameraHeight;
      if (hIn > 0) effVis -= (lastVis * hIn) / v.visibleDistance;
    }
  }

  // Band ring height: p * depth / (0.2 * effVis)  (0x795b64 = 0.2).
  let h1 = cap;
  if (effVis > 0) {
    const bandH = (p * depth) / (0.2 * effVis);
    if (bandH < cap) {
      h1 = bandH < MIN_BAND_HEIGHT ? MIN_BAND_HEIGHT : bandH;
    }
  }

  let h0: number;
  let alpha0: number;
  let alpha1: number;
  if (effVis <= depth) {
    // More fog above the camera than visibility — the whole sky is fog.
    h0 = cap;
    h1 = cap;
    alpha0 = 1;
    alpha1 = 1;
  } else {
    // Saturation ring: the height on the sky sphere where a ray's slant
    // path through the fog slab equals effVis.
    const horiz = Math.sqrt(effVis * effVis - depth * depth);
    const satH = (p * depth) / horiz;
    h0 = Math.min(satH, cap);
    if (h0 === cap && h1 === cap) {
      // Both rings pinned at the cap (deep fog): the strip is opaque and
      // the fan carries a partial apex alpha derived from how far past
      // the cap the saturation ray reaches.
      alpha0 = 1;
      const temp = ((satH - cap) * horiz) / depth;
      alpha1 = temp <= p ? temp / p : 1;
    } else {
      // Common case: the ring alpha scales with how high the saturation
      // ring sits — this is what makes the sky fog fade in smoothly and
      // continuously as the camera sinks below the fog top.
      alpha0 = h0 / cap;
      alpha1 = 0;
    }
  }

  // Storm fog scale: both heights track volume 0's animated percentage
  // (Sky+0xe40), with the 60-unit minimum re-applied.
  const pct = fogVolumes[firstActive].percentage;
  h0 *= pct;
  h1 *= pct;
  if (h1 < MIN_BAND_HEIGHT) h1 = MIN_BAND_HEIGHT;

  return { h0, h1, alpha0, alpha1, radius: p };
}

/**
 * GLSL evaluation of the band alpha for a ray, matching the engine's
 * vertex-interpolated strip + fan geometry: opaque below h0, 1 → alpha0
 * across the strip (h0..h1), alpha0 → alpha1 across the fan (h1..apex).
 * `s` is the ray's height on the eye-centered sky sphere.
 * Uniforms: `fogBands` = (h0, h1, alpha0, alpha1), `skyRadius` = p.
 */
export const skyFogAlphaGlsl = /* glsl */ `
  uniform vec4 fogBands;
  uniform float skyRadius;

  float skyFogAlpha(float dirUp) {
    float s = dirUp * skyRadius;
    float h0 = fogBands.x;
    float h1 = fogBands.y;
    float a0 = fogBands.z;
    float a1 = fogBands.w;
    if (s <= h0) return 1.0;
    if (h1 > h0 && s <= h1) return mix(1.0, a0, (s - h0) / (h1 - h0));
    float t = clamp((s - h1) / max(skyRadius - h1, 0.001), 0.0, 1.0);
    return mix(a0, a1, t);
  }
`;
