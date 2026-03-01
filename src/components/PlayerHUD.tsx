import { useMemo } from "react";
import { useDemoCurrentTime, useDemoRecording } from "./DemoProvider";
import type { DemoEntity, DemoKeyframe, CameraModeFrame } from "../demo/types";
import { useEngineSelector } from "../state";
import styles from "./PlayerHUD.module.css";

/**
 * Binary search for the most recent keyframe at or before `time`.
 * Returns the keyframe's health/energy values (carried forward from last
 * known ghost update).
 */
function getStatusAtTime(
  keyframes: DemoKeyframe[],
  time: number,
): { health: number; energy: number } {
  if (keyframes.length === 0) return { health: 1, energy: 1 };

  let lo = 0;
  let hi = keyframes.length - 1;

  if (time <= keyframes[0].time) {
    return {
      health: keyframes[0].health ?? 1,
      energy: keyframes[0].energy ?? 1,
    };
  }
  if (time >= keyframes[hi].time) {
    return {
      health: keyframes[hi].health ?? 1,
      energy: keyframes[hi].energy ?? 1,
    };
  }

  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid].time <= time) lo = mid;
    else hi = mid;
  }

  return {
    health: keyframes[lo].health ?? 1,
    energy: keyframes[lo].energy ?? 1,
  };
}

/** Binary search for the active CameraModeFrame at a given time. */
function getCameraModeAtTime(
  frames: CameraModeFrame[],
  time: number,
): CameraModeFrame | null {
  if (frames.length === 0) return null;
  if (time < frames[0].time) return null;
  if (time >= frames[frames.length - 1].time) return frames[frames.length - 1];

  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= time) lo = mid;
    else hi = mid;
  }
  return frames[lo];
}

function HealthBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={styles.HealthBar}>
      <div className={styles.BarFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

function EnergyBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={styles.EnergyBar}>
      <div className={styles.BarFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ChatWindow() {
  return <div className={styles.ChatWindow} />;
}

function WeaponSlots() {
  return <div className={styles.WeaponSlots} />;
}

function ToolBelt() {
  return <div className={styles.ToolBelt} />;
}

function Reticle() {
  return <div className={styles.Reticle} />;
}

function TeamStats() {
  return <div className={styles.TeamStats} />;
}

function Compass() {
  return <div className={styles.Compass} />;
}

export function PlayerHUD() {
  const recording = useDemoRecording();
  const currentTime = useDemoCurrentTime();
  const streamSnapshot = useEngineSelector(
    (state) => state.playback.streamSnapshot,
  );

  // Build an entity lookup by ID for quick access.
  const entityMap = useMemo(() => {
    const map = new Map<string | number, DemoEntity>();
    if (!recording) return map;
    for (const entity of recording.entities) {
      map.set(entity.id, entity);
    }
    return map;
  }, [recording]);

  if (!recording) return null;
  if (recording.isMetadataOnly || recording.isPartial) {
    const status = streamSnapshot?.status;
    if (!status) return null;
    return (
      <div className={styles.PlayerHUD}>
        <ChatWindow />
        <Compass />
        <HealthBar value={status.health} />
        <EnergyBar value={status.energy} />
        <TeamStats />
        <Reticle />
        <ToolBelt />
        <WeaponSlots />
      </div>
    );
  }

  // Determine which entity to show status for based on camera mode.
  const frame = getCameraModeAtTime(recording.cameraModes, currentTime);

  // Resolve health and energy for the active player:
  // - First-person: health from ghost entity (DamageMask), energy from the
  //   recording_player entity (CO readPacketData, higher precision).
  // - Third-person (orbit): both from the orbit target entity.
  let status = { health: 1, energy: 1 };
  if (frame?.mode === "first-person") {
    const ghostEntity = recording.controlPlayerGhostId
      ? entityMap.get(recording.controlPlayerGhostId)
      : undefined;
    const recEntity = entityMap.get("recording_player");
    const ghostStatus = ghostEntity
      ? getStatusAtTime(ghostEntity.keyframes, currentTime)
      : undefined;
    const recStatus = recEntity
      ? getStatusAtTime(recEntity.keyframes, currentTime)
      : undefined;
    status = {
      health: ghostStatus?.health ?? 1,
      // Prefer CO energy (available every tick) over ghost energy (sparse).
      energy: recStatus?.energy ?? ghostStatus?.energy ?? 1,
    };
  } else if (frame?.mode === "third-person" && frame.orbitTargetId) {
    const entity = entityMap.get(frame.orbitTargetId);
    if (entity) {
      status = getStatusAtTime(entity.keyframes, currentTime);
    }
  }

  return (
    <div className={styles.PlayerHUD}>
      <ChatWindow />
      <Compass />
      <HealthBar value={status.health} />
      <EnergyBar value={status.energy} />
      <TeamStats />
      <Reticle />
      <ToolBelt />
      <WeaponSlots />
    </div>
  );
}
