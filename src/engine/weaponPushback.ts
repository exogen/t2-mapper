import { Matrix4, Quaternion, Vector3, type Object3D } from "three";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import { torqueVecToThree } from "../scene/coordinates";
import { findOwnNode } from "../sceneNodes";
import type { StreamEntity } from "../stream/types";
import { markTransformChanged } from "../transformChanges";
import { posedNodeWorldMatrix } from "./deferredPose";

const visualRoots = new WeakMap<Object3D, Object3D>();

export function findImageRetractionNode(
  image: Object3D,
  muzzle: Object3D,
): Object3D {
  return findOwnNode(image, "retractionPoint") ?? muzzle;
}

/** ShapeBase's raw render node transform excludes Player::renderMountedImage's
 * draw-only translation. Undo it in world space using the current mount basis. */
export function readUnshiftedMountedImagePosition(
  image: Object3D,
  node: Object3D,
  out: Vector3,
): Vector3 {
  out.setFromMatrixPosition(posedNodeWorldMatrix(node));
  const visual = visualRoots.get(image);
  const mount = visual?.parent;
  if (visual && mount) {
    const { x, y, z } = visual.position;
    const m = mount.matrixWorld.elements;
    out.x -= m[0] * x + m[4] * y + m[8] * z;
    out.y -= m[1] * x + m[5] * y + m[9] * z;
    out.z -= m[2] * x + m[6] * y + m[10] * z;
  }
  return out;
}

const rebased = new Matrix4();
const renderedInverse = new Matrix4();
const correction = new Matrix4();
const carrierRebase = new Matrix4();
const renderYawInverse = new Quaternion();
const rotation = new Quaternion();
const simPosition = new Vector3();
const start = new Vector3();
const end = new Vector3();
const imageOrigin = new Vector3();
const imageMuzzle = new Vector3();
const translation = new Vector3();

type CarrierPose = Pick<StreamEntity, "position" | "rotation">;

function simulationWorldMatrix(
  position: NonNullable<CarrierPose["position"]>,
  quaternion: CarrierPose["rotation"],
  out: Matrix4,
) {
  if (quaternion) rotation.fromArray(quaternion);
  else rotation.identity();
  return out
    .makeRotationFromQuaternion(rotation)
    .setPosition(torqueVecToThree(position, simPosition));
}

/** Convert points from the current render pose to the simulation pose of the
 * body. The native ray uses this root with the same animated mount nodes. */
function simulationRebase(
  player: StreamEntity,
  body: Object3D,
  carrier: CarrierPose | undefined,
  carrierRoot: Object3D | undefined,
): Matrix4 {
  const rendered = posedNodeWorldMatrix(body);
  renderedInverse.copy(rendered).invert();
  if (!player.mountObjectId) {
    if (!player.position) return rebased.identity();
    return simulationWorldMatrix(
      player.position,
      player.rotation,
      rebased,
    ).multiply(renderedInverse);
  }

  // The seat already supplies the carrier's mount transform. Preserve that
  // transform under the carrier, and replace the displayed passenger yaw.
  if (player.rotation) rotation.fromArray(player.rotation);
  else rotation.identity();
  renderYawInverse.copy(body.quaternion).invert().multiply(rotation);
  rebased
    .copy(rendered)
    .multiply(correction.makeRotationFromQuaternion(renderYawInverse));
  if (carrier?.position && carrierRoot) {
    correction.copy(posedNodeWorldMatrix(carrierRoot)).invert();
    simulationWorldMatrix(
      carrier.position,
      carrier.rotation,
      carrierRebase,
    ).multiply(correction);
    rebased.premultiply(carrierRebase);
  }
  return rebased.multiply(renderedInverse);
}

/** Slot zero's image root moves solely for rendering. This mirrors retail
 * Player::calcClassRenderData (0x5dc5a0) and renderMountedImage (0x5dc670). */
export function createWeaponPushback(
  imageMount: Object3D,
  model: Object3D,
  image: Object3D,
) {
  visualRoots.set(image, model);
  const muzzle = findOwnNode(image, "muzzlePoint") ?? image;
  const retraction = findImageRetractionNode(image, muzzle);
  return {
    update(
      player: StreamEntity | undefined,
      body: Object3D,
      carrier?: CarrierPose,
      carrierRoot?: Object3D,
    ): void {
      translation.set(0, 0, 0);
      if (
        player?.type === "Player" &&
        !player.damageState &&
        imageMount.parent
      ) {
        const rebase = simulationRebase(player, body, carrier, carrierRoot);
        imageOrigin.setFromMatrixPosition(posedNodeWorldMatrix(imageMount));
        start.copy(imageOrigin).applyMatrix4(rebase);
        readUnshiftedMountedImagePosition(image, retraction, end).applyMatrix4(
          rebase,
        );
        const hit = renderShapeRaycast.weaponRetractionHit(
          start,
          end,
          player.id,
          false,
        );
        if (hit != null && hit < 1) {
          readUnshiftedMountedImagePosition(image, muzzle, imageMuzzle);
          translation
            .subVectors(imageOrigin, imageMuzzle)
            .multiplyScalar(1 - hit)
            .add(imageOrigin)
            .applyMatrix4(correction.copy(imageMount.matrixWorld).invert());
        }
      }
      if (!model.position.equals(translation)) {
        model.position.copy(translation);
        markTransformChanged(model);
      }
    },
  };
}
