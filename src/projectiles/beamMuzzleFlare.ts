import { Sprite, SpriteMaterial, Vector3 } from "three";
import type { Camera, Color, Texture } from "three";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import type { BeamMuzzleFlareVisual } from "../stream/types";

const cameraPosition = new Vector3();
const cameraDirection = new Vector3();
const toMuzzle = new Vector3();

/** The sniper and targeting lasers draw the same two screen-size squares
 * at the muzzle after a visibility ray (retail 0x642940 and 0x6431a0). */
export function createBeamMuzzleFlare(
  visual: BeamMuzzleFlareVisual,
  map: Texture | undefined,
  color: Color,
  viewportHeight: () => number,
) {
  const material = new SpriteMaterial({
    map: map ?? null,
    color,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const primary = new Sprite(material);
  const secondary = new Sprite(material.clone());
  primary.visible = secondary.visible = false;
  const cutoff = -Math.cos((visual.flareAngle * Math.PI) / 180);

  return {
    sprites: [primary, secondary] as const,
    update(
      camera: Camera,
      muzzle: Vector3,
      direction: Vector3,
      sourceId: string | undefined,
      elapsed: number,
      opacity = 1,
    ) {
      primary.visible = secondary.visible = false;
      camera.getWorldPosition(cameraPosition);
      toMuzzle.subVectors(muzzle, cameraPosition);
      const distance = toMuzzle.length();
      if (distance === 0) return;
      const facing = Math.max(-1, toMuzzle.dot(direction) / distance);
      if (facing >= -0.5) return;
      camera.getWorldDirection(cameraDirection);
      if (cameraDirection.dot(direction) >= -0.5) return;

      const size =
        facing >= cutoff
          ? visual.minFlareSize
          : (visual.maxFlareSize * (cutoff - facing)) / (1 + cutoff);
      if (size <= 0) return;

      // Convert authored pixel width to camera-facing world width. The
      // homogeneous factor is depth for perspective cameras and 1 for ortho.
      const depth = toMuzzle.dot(cameraDirection);
      const projection = camera.projectionMatrix.elements;
      const clipW = projection[15] - projection[11] * depth;
      const scale = (2 * size * clipW) / (projection[5] * viewportHeight());
      if (depth <= 0 || scale <= 0 || !Number.isFinite(scale)) return;
      if (renderShapeRaycast.targetBeamHit(cameraPosition, muzzle, sourceId))
        return;

      primary.position.copy(muzzle);
      secondary.position.copy(muzzle);
      primary.scale.setScalar(scale);
      secondary.scale.setScalar(scale * 0.75);
      primary.material.rotation = elapsed;
      secondary.material.rotation = -elapsed;
      primary.material.opacity = secondary.material.opacity = opacity;
      primary.visible = secondary.visible = true;
    },
  };
}
