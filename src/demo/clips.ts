import {
  AnimationClip,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";
import type { DemoEntity } from "./types";

/**
 * Build a Three.js AnimationClip from a DemoEntity's keyframes.
 * Position is in Torque space [x,y,z] → converted to Three.js [y,z,x].
 * Rotation is already a Three.js quaternion [x,y,z,w].
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

    // Torque [x,y,z] → Three.js [y,z,x]
    positions[i * 3] = kf.position[1];
    positions[i * 3 + 1] = kf.position[2];
    positions[i * 3 + 2] = kf.position[0];

    const [qx, qy, qz, qw] = kf.rotation;
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