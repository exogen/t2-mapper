/**
 * Where a beam leaves its shooter, shared by the ELF/repair link beams
 * and the shocklance: the mounted weapon's Muzzlepoint node
 * (getRenderMuzzlePoint) and the direction the shooter aims
 * (getRenderMuzzleVector).
 */
import { Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import { findOwnNode } from "../sceneNodes";
import { gameEntityStore } from "../state/gameEntityStore";
import { yawPitchToQuaternion } from "../stream/streamHelpers";
import { streamRenderFrame } from "../stream/interpolateEntity";
import { getPlayerViewAngles } from "../stream/playerView";

const _aimQuat = new Quaternion();
const _aimAngles = { pitch: 0, yaw: 0 };

const imageMuzzles = new Map<string, Map<number, Object3D>>();

/** Register only this mounted image's own muzzle, realizing its lazy DTS path.
 * ShapeBase::getRenderImageTransform falls back to the image transform when
 * the node is absent. Mount replacement/unmount invalidates immediately. */
export function registerImageMuzzle(
  ownerId: string,
  slot: number,
  image: Object3D,
): () => void {
  let slots = imageMuzzles.get(ownerId);
  if (!slots) imageMuzzles.set(ownerId, (slots = new Map()));
  const muzzle = findOwnNode(image, "muzzlePoint") ?? image;
  slots.set(slot, muzzle);
  return () => {
    if (slots.get(slot) !== muzzle) return;
    slots.delete(slot);
    if (!slots.size && imageMuzzles.get(ownerId) === slots)
      imageMuzzles.delete(ownerId);
  };
}

/** ShapeBase::getRenderMuzzlePoint(sourceSlot): the selected image's animated
 * muzzle in world space, or the source transform if no image is mounted. */
export function muzzleWorldPosition(
  sourceId: string | undefined,
  source: Object3D,
  slot: number,
  out: Vector3,
): Vector3 {
  const muzzle = sourceId ? imageMuzzles.get(sourceId)?.get(slot) : undefined;
  return (muzzle ?? source).getWorldPosition(out);
}

/** ShapeBase::getRenderMuzzleVector uses the mounted muzzle's orientation.
 * Players have a separate look-direction override in getRenderMuzzleTransform. */
export function sourceAimDirection(
  sourceId: string | undefined,
  source: Object3D,
  slot: number,
  out: Vector3,
): Vector3 {
  const srcEntity = sourceId
    ? gameEntityStore.getState().streamEntities.get(sourceId)
    : undefined;
  if (srcEntity?.renderType !== "Player") {
    const muzzle = sourceId ? imageMuzzles.get(sourceId)?.get(slot) : undefined;
    if (muzzle) return muzzle.getWorldDirection(out);
    source.updateWorldMatrix(true, false);
    // Native DTS +Y becomes model +Z; an unmounted source uses world +X.
    return out.set(1, 0, 0).transformDirection(source.matrixWorld);
  }
  const sharedAim =
    streamRenderFrame.firstPersonPlayerId === srcEntity.id
      ? streamRenderFrame.firstPersonAim
      : null;
  const { yaw, pitch } =
    sharedAim ??
    getPlayerViewAngles(
      source.quaternion,
      streamRenderFrame.current?.get(srcEntity.id) ?? srcEntity,
      streamRenderFrame.interpT,
      _aimAngles,
      streamRenderFrame.aimCorrection,
    );
  _aimQuat.fromArray(yawPitchToQuaternion(yaw, pitch));
  return out.set(0, 0, -1).applyQuaternion(_aimQuat);
}
