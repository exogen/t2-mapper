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

  // An entity removed from the snapshot may still be mounted until
  // React commits the removal; hold it at its last keyframe position.
  if (!entity) {
    const kfs =
      renderEntity && "keyframes" in renderEntity
        ? renderEntity.keyframes
        : undefined;
    if (kfs?.[0]?.position) {
      const kf = kfs[0];
      child.visible = true;
      child.position.set(kf.position[1], kf.position[2], kf.position[0]);
      return;
    }
  }
  if (!entity?.position || (entity.fadeVal === 0 && !entity.cloakLevel)) {
    child.visible = false;
    return;
  }

  child.visible = true;
  if (previousEntity?.position) {
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
