import { Vector3, type Object3D } from "three";
import { DTSShape } from "../dts/dtsModel";
import { shadowFootprintSphere } from "../shadowProjection";
import { shapeBox } from "../shapeLighting";
import { vehicleClassNames } from "../stream/entityClassification";

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

/** What a caster needs from its entity each frame. */
export interface ShadowCasterState {
  className?: string;
  mountObjectId?: string;
  fadeVal?: number;
  cloakLevel?: number;
}

/**
 * Players and vehicles cast. The engine's ItemData also casts (its
 * noShadowLevel is 0.01), but item shadows are deliberately left out
 * here as visual clutter for little gain.
 */
export function castsProjectedShadow(className: string | undefined): boolean {
  return (
    className === "Player" ||
    (className != null && vehicleClassNames.has(className))
  );
}

/**
 * Register `root` as a projected-shadow caster until disposed. The engine
 * skips mounted objects (a passenger's shadow belongs to the vehicle's
 * silhouette) and cloaked ones, and scales the shadow by the object fade.
 */
export function createShadowCaster(
  root: Object3D,
  shapeName: string | undefined,
  read: () => ShadowCasterState | undefined | null,
): { update(): void; dispose(): void } {
  const box = shapeBox(shapeName, root);
  // An empty box (no DTS bounds and no meshes yet) must not become an
  // infinite radius; such a caster simply never draws.
  const radius = box.isEmpty() ? 0 : box.getSize(new Vector3()).length() * 0.5;
  const caster: ShadowCaster = {
    root,
    center: box.isEmpty() ? new Vector3() : box.getCenter(new Vector3()),
    radius: Number.isFinite(radius) ? radius : 0,
    enabled: false,
    alpha: 1,
  };
  addShadowCaster(caster);
  // Keep the shape posed while its shadow can be on screen, even when the
  // shape itself isn't.
  if (root instanceof DTSShape) {
    const center = new Vector3();
    const cameraPosition = new Vector3();
    root.reachBounds = (camera, target) => {
      if (!caster.enabled || !(caster.radius > 0)) return null;
      center.copy(caster.center).applyMatrix4(root.matrixWorld);
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      return shadowFootprintSphere(
        center,
        caster.radius * root.matrixWorld.getMaxScaleOnAxis(),
        cameraPosition.distanceTo(center),
        target,
      );
    };
  }
  return {
    update() {
      const entity = read();
      caster.enabled =
        !!entity &&
        castsProjectedShadow(entity.className) &&
        entity.mountObjectId == null &&
        !((entity.cloakLevel ?? 0) > 0);
      caster.alpha = entity?.fadeVal ?? 1;
    },
    dispose() {
      removeShadowCaster(caster);
      if (root instanceof DTSShape) root.reachBounds = null;
    },
  };
}
