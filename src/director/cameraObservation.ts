/** Adapter for a rendered browser/headless camera. Read AFTER camera motion
 * and world-matrix updates. Calling this never solves or changes a shot. */
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { DirectorCameraFrame } from "./observationContract";
import type { DirectorVec3 } from "./types";
import { detached } from "./stateJournal";

const torque = (v: Vector3): DirectorVec3 => [v.z, v.x, v.y];

export function captureDirectorCamera(
  camera: PerspectiveCamera,
  context: Omit<DirectorCameraFrame, "view" | "poseSource">,
): DirectorCameraFrame {
  // Matrix reads are intentional: getWorld* can update the camera's world
  // matrices. This optional observer must not change renderer state.
  const rotation = new Quaternion().setFromRotationMatrix(camera.matrixWorld);
  return detached({
    ...context,
    poseSource: "rendered",
    // Asymmetric subviews/film offsets need their actual projection matrix;
    // decline to certify visibility with a symmetric-frustum approximation.
    view:
      camera.view?.enabled || camera.filmOffset !== 0
        ? null
        : {
            eye: torque(
              new Vector3().setFromMatrixPosition(camera.matrixWorld),
            ),
            forward: torque(new Vector3(0, 0, -1).applyQuaternion(rotation)),
            up: torque(new Vector3(0, 1, 0).applyQuaternion(rotation)),
            verticalFovDeg: camera.getEffectiveFOV(),
            aspect: camera.aspect,
            near: camera.near,
            far: camera.far,
          },
  });
}
