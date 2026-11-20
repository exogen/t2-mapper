import { MathUtils, Matrix4, Quaternion, Vector3, type Object3D } from "three";
import { DTSShape } from "../dts/dtsModel";
import { threeToTorque } from "../scene/coordinates";
import type { StreamingPlayback, StreamSnapshot } from "../stream/types";
import { debrisRetention } from "../stream/debrisHistory";
import {
  getNumberField,
  isValidPosition,
  type Vec3,
} from "../stream/streamHelpers";
import { timelineRandom } from "../stream/timelineRandom";
import { findOwnNode } from "../sceneNodes";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { requestShockwave } from "./shockwaveRequests";
import { readUnshiftedMountedImagePosition } from "./weaponPushback";
import { FramePriority } from "./framePriority";
import type { FrameScheduler } from "./frameScheduler";
import type { ImageStateEffects } from "./imageStateAnimation";

const position = new Vector3();
const forward = new Vector3();
const right = new Vector3();
const up = new Vector3();
const velocity = new Vector3();
const rotation = new Quaternion();
const rotationMatrix = new Matrix4();
const modelToBody = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  -SHAPE_MODEL_ROTATION_Y,
);
const mountNodes = new WeakMap<Object3D, Object3D>();
type PendingEffect = Parameters<typeof emitImageWeaponEffects>;
const pending = new WeakMap<FrameScheduler, PendingEffect[]>();

/** Model callbacks can register in either order. Wait for the owner and its
 * image to finish animating before sampling the weapon mount. */
export function queueImageWeaponEffects(
  scheduler: FrameScheduler,
  ...effect: PendingEffect
): void {
  const queued = pending.get(scheduler);
  if (queued) queued.push(effect);
  else pending.set(scheduler, [effect]);
}

export function installImageWeaponEffects(
  scheduler: FrameScheduler,
): () => void {
  const stop = scheduler.add(FramePriority.WeaponEffects, () => {
    const queued = pending.get(scheduler);
    if (!queued) return;
    pending.delete(scheduler);
    for (const effect of queued) emitImageWeaponEffects(...effect);
  });
  return () => {
    stop();
    pending.delete(scheduler);
  };
}

/** Sample the animated mount0 position and its native +Y (DTS +Z) axis. */
export function imageFlashTransform(
  image: Object3D,
  origin: Vector3,
  axis: Vector3,
): void {
  let node = mountNodes.get(image);
  if (!node) {
    node = findOwnNode(image, "mount0") ?? image;
    mountNodes.set(image, node);
  }
  readUnshiftedMountedImagePosition(image, node, origin);
  axis.set(0, 0, 1).transformDirection(node.matrixWorld);
}

/** ShapeBase::ejectShell (0x005f9600) launches a Debris at the image's
 * mount0, with its rotation and launch direction in the owner's frame. */
export function emitImageWeaponEffects(
  playback: Pick<StreamingPlayback, "getDataBlockData" | "debrisHistory">,
  effects: ImageStateEffects,
  image: Object3D,
  owner: Object3D,
  snapshot: Pick<StreamSnapshot, "timeSec" | "gravity">,
): void {
  // An image asset can finish loading before its owner can mount it.
  let body: DTSShape | undefined;
  for (let parent = image.parent; parent !== owner; parent = parent.parent) {
    if (!parent) return;
    if (!body && parent instanceof DTSShape) body = parent;
  }
  const data = playback.getDataBlockData(effects.dataBlockId);
  const flash = effects.shockwave
    ? getNumberField(data, ["muzzleFlash"])
    : undefined;
  const history = playback.debrisHistory;
  if (!flash && (!effects.shellCount || !history)) return;
  imageFlashTransform(image, position, forward);
  const origin = threeToTorque(position);
  if (flash && flash > 0)
    requestShockwave({
      dataBlockId: flash,
      origin,
      normal: threeToTorque(forward),
      ownerId: owner.name,
    });

  const casing = getNumberField(data, ["casing"]);
  const speed = getNumberField(data, ["shellVelocity"]);
  const direction = data?.shellExitDir as Vec3 | undefined;
  if (
    !effects.shellCount ||
    !history ||
    casing == null ||
    casing <= 0 ||
    speed == null ||
    !isValidPosition(direction) ||
    !playback.getDataBlockData(casing)
  )
    return;

  // The posed shape includes a mounted player's own body turn, below the
  // seat's outer group. Remove the DTS model-axis conversion from that frame.
  // The mount0 query already updated both the body and its outer group.
  rotation.setFromRotationMatrix(
    rotationMatrix.extractRotation((body ?? owner).matrixWorld),
  );
  if (body) rotation.multiply(modelToBody);
  // Construct the native +Y-forward basis in Three axes. Retail perturbs
  // its two perpendicular components independently by sin(random angle).
  forward.set(direction.y, direction.z, direction.x).normalize();
  right.crossVectors(forward, up.set(0, 1, 0)).normalize();
  if (!right.lengthSq()) right.set(0, 0, 1);
  up.crossVectors(right, forward);
  const variance = MathUtils.degToRad(
    getNumberField(data, ["shellExitVariance"]) ?? 0,
  );
  const { timeSec: time, gravity } = snapshot;
  const expires =
    time + debrisRetention(casing, (id) => playback.getDataBlockData(id));
  const random = timelineRandom(casing, time, ...origin);
  for (let i = 0; i < effects.shellCount; i++) {
    velocity
      .copy(forward)
      .addScaledVector(right, Math.sin((random() * 2 - 1) * variance))
      .addScaledVector(up, Math.sin((random() * 2 - 1) * variance))
      .normalize()
      .multiplyScalar(speed)
      .applyQuaternion(rotation);
    history.add({
      kind: "shell",
      time,
      expires,
      dataBlockId: casing,
      position: origin,
      rotation: rotation.toArray(),
      normal: [0, 0, 1],
      velocity: threeToTorque(velocity),
      gravity,
    });
  }
}
