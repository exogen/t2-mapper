import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AnimationClip,
  AnimationMixer,
  Group,
  LoopOnce,
  Quaternion,
  Vector3,
} from "three";
import { useDemo } from "./DemoProvider";
import { createEntityClip } from "../demo/clips";
import type { DemoEntity } from "../demo/types";

/**
 * Interpolate camera position and rotation from keyframes at the given time.
 * Uses linear interpolation for position and slerp for rotation.
 */
function interpolateCameraAtTime(
  entity: DemoEntity,
  time: number,
  outPosition: Vector3,
  outQuaternion: Quaternion,
) {
  const { keyframes } = entity;
  if (keyframes.length === 0) return;

  // Clamp to range
  if (time <= keyframes[0].time) {
    const kf = keyframes[0];
    outPosition.set(kf.position[1], kf.position[2], kf.position[0]);
    setQuaternionFromTorque(kf.rotation, outQuaternion);
    return;
  }
  if (time >= keyframes[keyframes.length - 1].time) {
    const kf = keyframes[keyframes.length - 1];
    outPosition.set(kf.position[1], kf.position[2], kf.position[0]);
    setQuaternionFromTorque(kf.rotation, outQuaternion);
    return;
  }

  // Binary search for the bracketing keyframes.
  let lo = 0;
  let hi = keyframes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid].time <= time) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const kfA = keyframes[lo];
  const kfB = keyframes[hi];
  const t = (time - kfA.time) / (kfB.time - kfA.time);

  // Lerp position (in Three.js space).
  outPosition.set(kfA.position[1], kfA.position[2], kfA.position[0]);
  _tmpVec.set(kfB.position[1], kfB.position[2], kfB.position[0]);
  outPosition.lerp(_tmpVec, t);

  // Slerp rotation.
  setQuaternionFromTorque(kfA.rotation, outQuaternion);
  setQuaternionFromTorque(kfB.rotation, _tmpQuat);
  outQuaternion.slerp(_tmpQuat, t);
}

const _tmpVec = new Vector3();
const _tmpQuat = new Quaternion();
const _tmpAxis = new Vector3();

function setQuaternionFromTorque(
  rot: [number, number, number, number],
  out: Quaternion,
) {
  const [ax, ay, az, angleDegrees] = rot;
  _tmpAxis.set(ay, az, ax).normalize();
  const angleRadians = -angleDegrees * (Math.PI / 180);
  out.setFromAxisAngle(_tmpAxis, angleRadians);
}

/**
 * R3F component that plays back a demo recording using Three.js AnimationMixer.
 *
 * Camera entities are interpolated manually each frame (not via the mixer)
 * since the camera isn't part of the replay root group.
 *
 * All other entities get animated via AnimationMixer with clips targeting
 * named child groups.
 */
export function DemoPlayback() {
  const { recording, playbackRef } = useDemo();
  const { camera } = useThree();
  const rootRef = useRef<Group>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const timeRef = useRef(0);
  const lastSyncRef = useRef(0);

  // Identify the camera entity and non-camera entities.
  const { cameraEntity, otherEntities } = useMemo(() => {
    if (!recording) return { cameraEntity: null, otherEntities: [] };
    const cam = recording.entities.find((e) => e.type === "Camera") ?? null;
    const others = recording.entities.filter((e) => e.type !== "Camera");
    return { cameraEntity: cam, otherEntities: others };
  }, [recording]);

  // Create clips for non-camera entities.
  const entityClips = useMemo(() => {
    const map = new Map<string, AnimationClip>();
    for (const entity of otherEntities) {
      map.set(String(entity.id), createEntityClip(entity));
    }
    return map;
  }, [otherEntities]);

  // Set up the mixer and actions when recording/clips change.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || entityClips.size === 0) {
      mixerRef.current = null;
      return;
    }

    const mixer = new AnimationMixer(root);
    mixerRef.current = mixer;

    for (const [, clip] of entityClips) {
      const action = mixer.clipAction(clip);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    }

    // Start paused — useFrame will unpause based on playback state.
    mixer.timeScale = 0;

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
    };
  }, [entityClips]);

  // Drive playback each frame.
  useFrame((_state, delta) => {
    const pb = playbackRef.current;
    const mixer = mixerRef.current;

    // Handle pending seek.
    if (pb.pendingSeek != null) {
      timeRef.current = pb.pendingSeek;
      if (mixer) {
        mixer.setTime(pb.pendingSeek);
      }
      pb.pendingSeek = null;
    }

    // Handle pending play/pause state change.
    if (pb.pendingPlayState != null) {
      pb.isPlaying = pb.pendingPlayState;
      pb.pendingPlayState = null;
    }

    // Advance time if playing.
    if (pb.isPlaying && recording) {
      const advance = delta * pb.speed;
      timeRef.current += advance;

      // Clamp to duration; stop at end.
      if (timeRef.current >= recording.duration) {
        timeRef.current = recording.duration;
        pb.isPlaying = false;
        (pb as any).updateCurrentTime?.(timeRef.current);
      }

      if (mixer) {
        mixer.timeScale = 1;
        mixer.update(advance);
      }
    } else if (mixer) {
      mixer.timeScale = 0;
    }

    // Interpolate camera.
    if (cameraEntity && cameraEntity.keyframes.length > 0) {
      interpolateCameraAtTime(
        cameraEntity,
        timeRef.current,
        camera.position,
        camera.quaternion,
      );
    }

    // Throttle syncing current time to React state (~10 Hz).
    const now = performance.now();
    if (pb.isPlaying && now - lastSyncRef.current > 100) {
      lastSyncRef.current = now;
      pb.currentTime = timeRef.current;
      (pb as any).updateCurrentTime?.(timeRef.current);
    }
  });

  if (!recording) return null;

  return (
    <group ref={rootRef}>
      {otherEntities.map((entity) => (
        <DemoEntityGroup key={entity.id} entity={entity} />
      ))}
    </group>
  );
}

/**
 * Renders a placeholder for a non-camera demo entity.
 * The group name must match the entity ID so the AnimationMixer can target it.
 */
function DemoEntityGroup({ entity }: { entity: DemoEntity }) {
  const name = String(entity.id);
  const color = entityTypeColor(entity.type);

  return (
    <group name={name}>
      <mesh>
        <sphereGeometry args={[0.5, 8, 6]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
    </group>
  );
}

function entityTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case "player":
      return "#00ff88";
    case "vehicle":
      return "#ff8800";
    case "projectile":
      return "#ff0044";
    default:
      return "#8888ff";
  }
}
