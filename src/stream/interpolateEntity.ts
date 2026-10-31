import { Quaternion } from "three";
import { markTransformChanged } from "../transformChanges";
import type { Camera, Object3D } from "three";
import type { GameEntity } from "../state/gameEntityTypes";
import type { StreamCamera, StreamEntity } from "./types";
import { playerBodyYawCorrection } from "./playerView";
import { torqueVecToThree } from "../scene/coordinates";

const quatB = new Quaternion(),
  quatYaw = new Quaternion(),
  billboardFlip = new Quaternion(0, 1, 0, 0);
/** The current interpolation inputs, shared with visuals acquired later in the frame. */
export const streamRenderFrame: {
  current: ReadonlyMap<string, StreamEntity> | null;
  previous: ReadonlyMap<string, StreamEntity> | null;
  interpT: number;
  /**
   * Read packed player views at the middle of their step (playerView.ts).
   */
  aimCorrection: boolean;
  /** Recorded view used by the camera pass; held during incomplete seeks. */
  camera: StreamCamera | null;
} = {
  current: null,
  previous: null,
  interpT: 0,
  aimCorrection: false,
  camera: null,
};

/**
 * Player body yaw is relative to its mount, but uses the same render delta
 * and snapshot interpolation as an unmounted entity's rotation.
 * `yawCorrection` turns a player's body further (playerBodyYawCorrection).
 */
export function applyStreamEntityRotation(
  target: Quaternion,
  entity: Pick<StreamEntity, "rotation" | "playerDelta">,
  previousEntity: Pick<StreamEntity, "rotation"> | undefined,
  interpT: number,
  yawCorrection = 0,
): void {
  if (entity.playerDelta) {
    const { rot, rotVec } = entity.playerDelta;
    const halfAngle = -(rot + rotVec * (1 - interpT) + yawCorrection) / 2;
    target.set(0, Math.sin(halfAngle), 0, Math.cos(halfAngle));
  } else if (entity.rotation) {
    if (previousEntity?.rotation) {
      quatB.fromArray(entity.rotation);
      target.fromArray(previousEntity.rotation).slerp(quatB, interpT);
    } else {
      target.fromArray(entity.rotation);
    }
    if (yawCorrection) {
      const halfAngle = -yawCorrection / 2;
      target.multiply(
        quatYaw.set(0, Math.sin(halfAngle), 0, Math.cos(halfAngle)),
      );
    }
  }
}

export function applyStreamEntityPose(
  child: Object3D,
  renderEntity: GameEntity | undefined,
  entity: StreamEntity | undefined,
  previousEntity: StreamEntity | undefined,
  interpT: number,
  camera: Camera,
  aimCorrection = false,
): void {
  // React/Suspense may not have committed removals yet. The destination
  // snapshot controls presence immediately, including during a seek.
  if (!entity || entity.destroyedHidden) {
    child.visible = false;
    return;
  }
  // Link beams (ELF/repair) have no ghost position at all — they
  // draw themselves in world space between two live objects, and
  // manage their own visibility. The no-position hide below would
  // blank them permanently.
  if (
    renderEntity?.renderType === "LinkBeam" ||
    renderEntity?.renderType === "ShockLance"
  ) {
    child.visible = true;
    return;
  }

  if (!entity?.position || (entity.fadeVal === 0 && !entity.cloakLevel)) {
    child.visible = false;
    return;
  }

  child.visible = true;
  const { position, quaternion } = child;
  const px = position.x,
    py = position.y,
    pz = position.z,
    qx = quaternion.x,
    qy = quaternion.y,
    qz = quaternion.z,
    qw = quaternion.w;
  posePosition(child, entity.position, entity, previousEntity, interpT);
  poseRotation(child, entity, previousEntity, interpT, camera, aimCorrection);
  // A frozen root recomposes only when its pose actually changed, so an
  // unmoved entity's subtree keeps its world matrices.
  if (
    !child.matrixAutoUpdate &&
    (position.x !== px ||
      position.y !== py ||
      position.z !== pz ||
      quaternion.x !== qx ||
      quaternion.y !== qy ||
      quaternion.z !== qz ||
      quaternion.w !== qw)
  )
    markTransformChanged(child);
}

function posePosition(
  child: Object3D,
  position: readonly [number, number, number],
  entity: StreamEntity,
  previousEntity: StreamEntity | undefined,
  interpT: number,
): void {
  if (entity.playerDelta) {
    const delta = entity.playerDelta.posVec;
    const dt = 1 - interpT;
    child.position.set(
      position[1] + delta[1] * dt,
      position[2] + delta[2] * dt,
      position[0] + delta[0] * dt,
    );
  } else if (previousEntity?.position) {
    const px = previousEntity.position[0];
    const py = previousEntity.position[1];
    const pz = previousEntity.position[2];
    const cx = position[0];
    const cy = position[1];
    const cz = position[2];
    const ix = px + (cx - px) * interpT;
    const iy = py + (cy - py) * interpT;
    const iz = pz + (cz - pz) * interpT;
    child.position.set(iy, iz, ix);
  } else {
    torqueVecToThree(position, child.position);
  }
}

function poseRotation(
  child: Object3D,
  entity: StreamEntity,
  previousEntity: StreamEntity | undefined,
  interpT: number,
  camera: Camera,
  aimCorrection: boolean,
): void {
  if (entity.faceViewer) {
    child.quaternion.copy(camera.quaternion).multiply(billboardFlip);
  } else if (entity.visual?.kind === "tracer") {
    child.quaternion.identity();
  } else {
    applyStreamEntityRotation(
      child.quaternion,
      entity,
      previousEntity,
      interpT,
      playerBodyYawCorrection(entity, aimCorrection),
    );
  }
}
