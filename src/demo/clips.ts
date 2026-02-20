import {
  AnimationClip,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import type { DemoEntity, DemoRecording } from "./types";

/**
 * Convert a Torque position `[x, y, z]` to Three.js `[y, z, x]`.
 * Matches `getPosition` in `src/mission.ts`.
 */
function torquePositionToThree(
  pos: [number, number, number],
): [number, number, number] {
  return [pos[1], pos[2], pos[0]];
}

/**
 * Convert a Torque axis-angle rotation `[ax, ay, az, angleDegrees]` to a
 * Three.js quaternion `[x, y, z, w]`.
 * Matches `getRotation` in `src/mission.ts`: axis is reordered `(ay, az, ax)`
 * and the angle is negated.
 */
function torqueRotationToQuaternion(
  rot: [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, angleDegrees] = rot;
  const axis = new Vector3(ay, az, ax).normalize();
  const angleRadians = -angleDegrees * (Math.PI / 180);
  const q = new Quaternion().setFromAxisAngle(axis, angleRadians);
  return [q.x, q.y, q.z, q.w];
}

/**
 * Build a Three.js AnimationClip from a DemoEntity's keyframes.
 * Position and rotation values are converted from Torque to Three.js space.
 */
export function createEntityClip(entity: DemoEntity): AnimationClip {
  const { keyframes } = entity;
  const name = String(entity.id);

  const times = new Float32Array(keyframes.length);
  const positions = new Float32Array(keyframes.length * 3);
  const quaternions = new Float32Array(keyframes.length * 4);

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i];
    times[i] = kf.time;

    const [px, py, pz] = torquePositionToThree(kf.position);
    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;

    const [qx, qy, qz, qw] = torqueRotationToQuaternion(kf.rotation);
    quaternions[i * 4] = qx;
    quaternions[i * 4 + 1] = qy;
    quaternions[i * 4 + 2] = qz;
    quaternions[i * 4 + 3] = qw;
  }

  const tracks = [
    new VectorKeyframeTrack(`${name}.position`, times, positions),
    new QuaternionKeyframeTrack(`${name}.quaternion`, times, quaternions),
  ];

  return new AnimationClip(name, -1, tracks);
}

/**
 * Convert all entities in a recording to AnimationClips, keyed by entity ID.
 */
export function createDemoClips(
  recording: DemoRecording,
): Map<string, AnimationClip> {
  const clips = new Map<string, AnimationClip>();
  for (const entity of recording.entities) {
    const clip = createEntityClip(entity);
    clips.set(String(entity.id), clip);
  }
  return clips;
}
