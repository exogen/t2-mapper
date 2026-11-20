/**
 * The mounted weapon's Muzzlepoint and render aim, shared by weapon effects.
 */
import { Vector3, type Camera, type Object3D } from "three";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import { DTSShape } from "../dts/dtsModel";
import { posedNodeWorldMatrix } from "./deferredPose";
import { findOwnNode } from "../sceneNodes";
import { streamRenderFrame } from "../stream/interpolateEntity";
import { getPlayerHeadAngles } from "../stream/playerView";
import { usesPlayerBodyMuzzleAim } from "../stream/playerAnimation";
import { MAX_LOOK_ANGLE } from "../stream/quantizedPlayerAim";
import { MAX_PITCH } from "../stream/streamHelpers";
import {
  findImageRetractionNode,
  readUnshiftedMountedImagePosition,
} from "./weaponPushback";

const EYE_AIM_RANGE = 500;
const EYE_AIM_MIN_DISTANCE = 6;
const EYE_AIM_EPSILON = 0.2;

const eye = new Vector3();
const eyeDirection = new Vector3();
const eyeTarget = new Vector3();
const imageStart = new Vector3();
const retractionPoint = new Vector3();
const headAngles = { pitch: 0, yaw: 0 };

interface MountedImage {
  root: Object3D;
  muzzle: Object3D;
  retraction: Object3D;
}

const mountedImages = new Map<string, Map<number, MountedImage>>();
const playerMuzzleActions = new WeakMap<Object3D, string | number>();

export function setPlayerMuzzleAction(
  source: Object3D,
  action: string | number | undefined,
): void {
  if (action === undefined) playerMuzzleActions.delete(source);
  else playerMuzzleActions.set(source, action);
}

/** Register only this mounted image's own muzzle, realizing its lazy DTS path.
 * ShapeBase::getRenderImageTransform falls back to the image transform when
 * the node is absent. Mount replacement/unmount invalidates immediately. */
export function registerImageMuzzle(
  ownerId: string,
  slot: number,
  image: Object3D,
): () => void {
  let slots = mountedImages.get(ownerId);
  if (!slots) mountedImages.set(ownerId, (slots = new Map()));
  const muzzle = findOwnNode(image, "muzzlePoint") ?? image;
  const entry = {
    root: image,
    muzzle,
    retraction: findImageRetractionNode(image, muzzle),
  };
  slots.set(slot, entry);
  return () => {
    if (slots.get(slot) !== entry) return;
    slots.delete(slot);
    if (!slots.size && mountedImages.get(ownerId) === slots)
      mountedImages.delete(ownerId);
  };
}

/** The mounted image can load before the owner has a mount to attach it to. */
function mountedImage(
  sourceId: string | undefined,
  source: Object3D,
  slot: number,
): MountedImage | undefined {
  const entry = sourceId ? mountedImages.get(sourceId)?.get(slot) : undefined;
  if (!entry) return;
  for (let node: Object3D | null = entry.root; node; node = node.parent) {
    if (node === source) return entry;
  }
}

/** Sample a named node's logical position and return its posed orientation. */
export function readMountedImageNodePosition(
  sourceId: string,
  source: Object3D,
  slot: number,
  name: string,
  out: Vector3,
): Object3D | undefined {
  const entry = mountedImage(sourceId, source, slot);
  if (!entry) return;
  const node = findOwnNode(entry.root, name) ?? entry.root;
  readUnshiftedMountedImagePosition(entry.root, node, out);
  return node;
}

function playerRetractionHit(
  sourceId: string | undefined,
  image: MountedImage,
): number | undefined {
  const player = sourceId && streamRenderFrame.current?.get(sourceId);
  if (!player || player.type !== "Player" || player.damageState) return;
  readUnshiftedMountedImagePosition(image.root, image.root, imageStart);
  readUnshiftedMountedImagePosition(
    image.root,
    image.retraction,
    retractionPoint,
  );
  return renderShapeRaycast.weaponRetractionHit(
    imageStart,
    retractionPoint,
    player.id,
    true,
  );
}

/** Player::getRenderMuzzleTransform separately stops the logical muzzle
 * at the first render ray hit. The weapon's visual offset is computed
 * from a simulation ray and never changes these unshifted endpoints. */
export function muzzleWorldPosition(
  sourceId: string | undefined,
  source: Object3D,
  slot: number,
  out: Vector3,
): Vector3 {
  const image = mountedImage(sourceId, source, slot);
  if (!image) return out.setFromMatrixPosition(posedNodeWorldMatrix(source));
  const hit = playerRetractionHit(sourceId, image);
  if (hit !== undefined)
    return out.lerpVectors(imageStart, retractionPoint, hit);
  return readUnshiftedMountedImagePosition(image.root, image.muzzle, out);
}

export function imageMuzzleWorldDirection(
  sourceId: string | undefined,
  source: Object3D,
  slot: number,
  out: Vector3,
): Vector3 {
  const image = mountedImage(sourceId, source, slot);
  const muzzle =
    image &&
    (image.muzzle !== image.retraction &&
    playerRetractionHit(sourceId, image) !== undefined
      ? image.retraction
      : image.muzzle);
  // Native DTS +Y becomes model +Z; an unrotated entity root uses +X.
  const useModelAxes = muzzle || source instanceof DTSShape;
  return out
    .set(useModelAxes ? 0 : 1, 0, useModelAxes ? 1 : 0)
    .transformDirection(posedNodeWorldMatrix(muzzle ?? source));
}

export function isFirstPersonMuzzleSource(
  sourceId: string | undefined,
): boolean {
  return (
    streamRenderFrame.maskFirstPersonPose &&
    streamRenderFrame.firstPersonPlayerId === sourceId
  );
}

/** ShapeBase::getRenderMuzzleVector (0x5f73c0) uses the corrected eye ray
 * in first person. Outside that view, standard player poses aim from the
 * body's orientation and head pitch; custom mount poses use the image node. */
export function sourceAimDirection(
  sourceId: string | undefined,
  source: Object3D,
  slot: number,
  muzzle: Vector3,
  camera: Camera,
  out: Vector3,
): Vector3 {
  if (isFirstPersonMuzzleSource(sourceId)) {
    // The final, corrected camera aim is already in world space, including
    // the rotation of a vehicle carrying the shooter.
    camera.getWorldPosition(eye);
    camera.getWorldDirection(eyeDirection);
    eyeTarget.copy(eye).addScaledVector(eyeDirection, EYE_AIM_RANGE);
    const hit = renderShapeRaycast.targetBeamHit(eye, eyeTarget, sourceId);
    if (hit) {
      const distance = hit.t * EYE_AIM_RANGE;
      eyeTarget
        .copy(eye)
        .addScaledVector(
          eyeDirection,
          distance > EYE_AIM_EPSILON
            ? Math.max(distance, EYE_AIM_MIN_DISTANCE)
            : distance,
        );
    }
    out.subVectors(eyeTarget, muzzle);
    if (out.lengthSq() > EYE_AIM_EPSILON ** 2) return out.normalize();
  }

  const player = sourceId
    ? streamRenderFrame.current?.get(sourceId)
    : undefined;
  const action = playerMuzzleActions.get(source) ?? player?.actionSlot?.action;
  if (player?.type !== "Player" || !usesPlayerBodyMuzzleAim(action)) {
    return imageMuzzleWorldDirection(sourceId, source, slot, out);
  }
  const look = getPlayerHeadAngles(
    player,
    streamRenderFrame.interpT,
    headAngles,
    streamRenderFrame.aimCorrection,
  );
  const pitch =
    look.pitch *
    (player.playerDelta?.maxLookAngle ??
      (player.viewQuantized === false ? MAX_PITCH : MAX_LOOK_ANGLE));
  const forward = Math.cos(pitch);
  // A DTS model's +Z is the body wrapper's +X after the asset-axis remap.
  return (
    source instanceof DTSShape
      ? out.set(0, -Math.sin(pitch), forward)
      : out.set(forward, -Math.sin(pitch), 0)
  ).transformDirection(posedNodeWorldMatrix(source));
}
