import type { Object3D, Vector3 } from "three";

/**
 * A shape that casts an engine-style projected shadow: players and
 * vehicles (the engine also shadows items, which this app skips; statics,
 * turrets and projectiles never cast).
 * The owning component keeps `enabled` and `alpha` current every frame;
 * ShadowPool renders the shadow-eligible meshes in `root`'s subtree and projects them
 * onto the terrain and interiors beneath.
 */
export interface ShadowCaster {
  /** Model root; eligible geometry in its subtree (mounted weapons included) casts. */
  root: Object3D;
  /** DTS bounds centre in `root`'s local space. */
  center: Vector3;
  /** Half the DTS bounds diagonal in `root`'s local units (the engine's
   *  Shadow::setRadius before object scale); 0 never casts. */
  radius: number;
  /** false while mounted, cloaked, or otherwise shadowless this frame. */
  enabled: boolean;
  /** Object fade (mFadeVal), multiplied into the shadow. */
  alpha: number;
}

const _shadowCasters = new Set<ShadowCaster>();

export function addShadowCaster(caster: ShadowCaster): void {
  _shadowCasters.add(caster);
}

export function removeShadowCaster(caster: ShadowCaster): void {
  _shadowCasters.delete(caster);
}

export function shadowCasters(): ReadonlySet<ShadowCaster> {
  return _shadowCasters;
}
