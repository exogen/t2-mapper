/**
 * Detect organic/vegetation shapes that use alpha for transparency.
 * These need special handling for materials, shadows, and collision.
 *
 * Pattern matches:
 * - borg/xorg/porg/dorg: Tribes 2 organic environment types
 * - plant/tree/bush/fern/vine/grass/leaf/flower: common vegetation names
 *
 * This lives outside `components/` because three consumers need it and
 * only one of them renders: materials (shapeMaterial), stream playback
 * (playbackUtils), and the collider policy — which must run in Node,
 * where importing a React component module to get a regex is silly.
 */
const ORGANIC_PATTERN =
  /borg|xorg|porg|dorg|plant|tree|bush|fern|vine|grass|leaf|flower|frond|palm|foliage/i;

export function isOrganicShape(shapeName: string): boolean {
  return ORGANIC_PATTERN.test(shapeName);
}
