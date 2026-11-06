import { Matrix4, Vector3, type Camera } from "three";
import { collisionState } from "../collision/collisionContext";
import { DIFCollisionMesh } from "../dif/difCollision";
import { outsideZoneRect, type DIFVisibilityRect } from "../dif/difVisibility";
import { threeToTorque } from "../scene/coordinates";

const cameraPosition = new Vector3();
const localCamera = new Vector3();
const viewProjection = new Matrix4();
const localToClip = new Matrix4();
const torqueToThree = new Matrix4().set(
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  1,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
);

/**
 * Retail precipitation belongs to outside zone 0. Its render projection is
 * restricted to the exterior visible through the camera's interior portals
 * (00681780 / 0056fac0 / 0056f8b0), rather than testing roofs above drops.
 * Reuse the placed DIF registry so loading, transforms, seeks and removal
 * have the same lifetime as the building itself. The result is full-view
 * NDC, or null when no exterior is visible.
 */
export function exteriorViewRect(camera: Camera): DIFVisibilityRect | null {
  camera.updateWorldMatrix(true, false);
  camera.getWorldPosition(cameraPosition);
  viewProjection.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const result: DIFVisibilityRect = [-1, -1, 1, 1];
  for (const entry of collisionState().interiors.values()) {
    for (const collider of entry.colliders) {
      if (!(collider.mesh instanceof DIFCollisionMesh)) continue;
      if (!collider.worldBox.containsPoint(cameraPosition)) continue;
      localCamera.copy(cameraPosition).applyMatrix4(collider.inverse);
      const collision = collider.mesh.collision;
      const zone = collision.zoneForPoint(localCamera);
      if (zone <= 0) continue;
      localToClip
        .multiplyMatrices(viewProjection, collider.matrixWorld)
        .multiply(torqueToThree);
      const visible = outsideZoneRect(
        collision.interior,
        threeToTorque(localCamera),
        localToClip,
        zone,
      );
      if (!visible) return null;
      // A camera inside nested buildings must see outside through both.
      result[0] = Math.max(result[0], visible[0]);
      result[1] = Math.max(result[1], visible[1]);
      result[2] = Math.min(result[2], visible[2]);
      result[3] = Math.min(result[3], visible[3]);
      if (result[0] >= result[2] || result[1] >= result[3]) return null;
    }
  }
  return result;
}
