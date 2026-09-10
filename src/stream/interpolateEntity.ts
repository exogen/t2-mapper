import { Quaternion } from "three";
import type { Camera, Object3D } from "three";
import type { GameEntity } from "../state/gameEntityTypes";
import type { StreamEntity } from "./types";

const quatA = new Quaternion(),
  quatB = new Quaternion(),
  billboardFlip = new Quaternion(0, 1, 0, 0);
/** The current interpolation inputs, shared with visuals acquired later in the frame. */
export const streamRenderFrame: {
  current: ReadonlyMap<string, StreamEntity> | null;
  previous: ReadonlyMap<string, StreamEntity> | null;
  interpT: number;
} = { current: null, previous: null, interpT: 0 };

export function applyStreamEntityPose(
  child: Object3D,
  renderEntity: GameEntity | undefined,
  entity: StreamEntity | undefined,
  previousEntity: StreamEntity | undefined,
  interpT: number,
  camera: Camera,
): void {
  // React/Suspense may not have committed removals yet. The destination
  // snapshot controls presence immediately, including during a seek.
  if (!entity) {
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
  if (entity.playerDelta) {
    const delta = entity.playerDelta.posVec;
    const dt = 1 - interpT;
    child.position.set(
      entity.position[1] + delta[1] * dt,
      entity.position[2] + delta[2] * dt,
      entity.position[0] + delta[0] * dt,
    );
  } else if (previousEntity?.position) {
    const px = previousEntity.position[0];
    const py = previousEntity.position[1];
    const pz = previousEntity.position[2];
    const cx = entity.position[0];
    const cy = entity.position[1];
    const cz = entity.position[2];
    const ix = px + (cx - px) * interpT;
    const iy = py + (cy - py) * interpT;
    const iz = pz + (cz - pz) * interpT;
    child.position.set(iy, iz, ix);
  } else {
    child.position.set(
      entity.position[1],
      entity.position[2],
      entity.position[0],
    );
  }

  if (entity.faceViewer) {
    child.quaternion.copy(camera.quaternion).multiply(billboardFlip);
  } else if (entity.visual?.kind === "tracer") {
    child.quaternion.identity();
  } else if (entity.playerDelta) {
    const { rot, rotVec } = entity.playerDelta;
    const halfAngle = -(rot + rotVec * (1 - interpT)) / 2;
    child.quaternion.set(0, Math.sin(halfAngle), 0, Math.cos(halfAngle));
  } else if (entity.rotation) {
    if (previousEntity?.rotation) {
      quatA.set(...previousEntity.rotation);
      quatB.set(...entity.rotation);
      quatA.slerp(quatB, interpT);
      child.quaternion.copy(quatA);
    } else {
      child.quaternion.set(...entity.rotation);
    }
  }
}
