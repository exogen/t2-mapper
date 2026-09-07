import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Object3D } from "three";
import { shapeBox } from "../shapeLighting";
import { vehicleClassNames } from "../stream/entityClassification";
import {
  addShadowCaster,
  removeShadowCaster,
  type ShadowCaster,
} from "./shadowCasters";

/** What the caster needs from its entity each frame. */
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
 * Register `root` as a projected-shadow caster while mounted. The engine
 * skips mounted objects (a passenger's shadow belongs to the vehicle's
 * silhouette) and cloaked ones, and scales the shadow by the object fade.
 */
export function useShadowCaster(
  root: Object3D,
  shapeName: string | undefined,
  read: () => ShadowCasterState | undefined | null,
): void {
  const caster = useMemo<ShadowCaster>(() => {
    const box = shapeBox(shapeName, root);
    // An empty box (no DTS bounds and no meshes yet) must not become an
    // infinite radius; such a caster simply never draws.
    const radius = box.isEmpty()
      ? 0
      : box.getSize(new Vector3()).length() * 0.5;
    return {
      root,
      center: box.isEmpty() ? new Vector3() : box.getCenter(new Vector3()),
      radius: Number.isFinite(radius) ? radius : 0,
      enabled: false,
      alpha: 1,
    };
  }, [root, shapeName]);

  useEffect(() => {
    addShadowCaster(caster);
    return () => removeShadowCaster(caster);
  }, [caster]);

  useFrame(() => {
    const entity = read();
    caster.enabled =
      !!entity &&
      castsProjectedShadow(entity.className) &&
      entity.mountObjectId == null &&
      !((entity.cloakLevel ?? 0) > 0);
    caster.alpha = entity?.fadeVal ?? 1;
  });
}
