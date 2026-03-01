import { DemoParser } from "t2-demo-parser";
import type { DemoFile, ControlObjectKeyframe } from "t2-demo-parser";
import { Matrix4, Quaternion } from "three";
import type {
  DemoRecording,
  DemoEntity,
  DemoKeyframe,
  CameraModeFrame,
} from "./types";

/**
 * Extract mission name and game type from the demo's string table values.
 *
 * The demo stores "readplayerinfo" entries in the demoValues string table.
 * Entry type "2" contains: `2\t<server>\t<ip>\t<date>\t<missionName>`
 * Entry type "3" contains: `3\t<mod>\t<gameType>\t<teamCount>\t...`
 */
function extractMissionInfo(demoValues: string[]): {
  missionName: string | null;
  gameType: string | null;
} {
  let missionName: string | null = null;
  let gameType: string | null = null;

  for (let i = 0; i < demoValues.length; i++) {
    if (demoValues[i] !== "readplayerinfo") continue;
    const value = demoValues[i + 1];
    if (!value) continue;

    if (value.startsWith("2\t")) {
      const fields = value.split("\t");
      // fields: ["2", serverName, ip, date, missionName]
      if (fields[4]) {
        missionName = fields[4];
      }
    } else if (value.startsWith("3\t")) {
      const fields = value.split("\t");
      // fields: ["3", mod, gameTypeName, teamCount, ...]
      if (fields[2]) {
        gameType = fields[2];
      }
    }
  }

  return { missionName, gameType };
}

// Block types from the demo format.
const BlockTypePacket = 0;
const BlockTypeSendPacket = 1;
const BlockTypeMove = 2;
const BlockTypeInfo = 3;
const TICK_DURATION_MS = 32;

interface MoveRotationSample {
  yaw: number;
  pitch: number;
}

interface CameraFovFrame {
  timeMs: number;
  fov: number;
}

interface TimelineEvent {
  time: number;
  type: string;
  classId: number;
  guaranteed: boolean;
  data?: Record<string, unknown>;
}

interface TimelineGhostKeyframe {
  time: number;
  position?: { x: number; y: number; z: number };
  rotation?:
    | { x: number; y: number; z: number; w: number }
    | { x: number; y: number; z: number };
  velocity?: { x: number; y: number; z: number };
  data?: Record<string, unknown>;
}

interface TimelineGhostInstance {
  ghostIndex: number;
  classId: number;
  className: string;
  spawnTime: number;
  despawnTime?: number;
  keyframes: TimelineGhostKeyframe[];
}

interface TimelineControlObjectKeyframe extends ControlObjectKeyframe {
  packetIndex: number;
}

interface MoveDerivedTimeline {
  durationMs: number;
  ghostInstances: TimelineGhostInstance[];
  controlObject: TimelineControlObjectKeyframe[];
  events: TimelineEvent[];
  moveRotationsByPacket: MoveRotationSample[];
  cameraFovFrames: CameraFovFrame[];
}

export interface ParseStepOptions {
  batchSize?: number;
  onProgress?: (progress: {
    blockCursor: number;
    blockCount?: number;
    moveTicks: number;
  }) => void;
}

export interface DemoParseSession {
  metadata: DemoRecording;
  parseRecording(options?: ParseStepOptions): Promise<DemoRecording>;
}

interface ParseStepContext {
  parser: DemoParser;
  demo: DemoFile;
  timeline: MoveDerivedTimeline;
  activeGhosts: Map<number, TimelineGhostInstance>;
  moveYawAccum: number;
  movePitchAccum: number;
  moveTicks: number;
}

function isPacketData(parsed: unknown): parsed is {
  gameState: {
    controlObjectGhostIndex?: number;
    controlObjectData?: Record<string, unknown>;
    compressionPoint?: { x: number; y: number; z: number };
  };
  events: Array<{
    classId: number;
    guaranteed: boolean;
    parsedData?: Record<string, unknown>;
  }>;
  ghosts: Array<{
    index: number;
    type: "create" | "update" | "delete";
    classId?: number;
    parsedData?: Record<string, unknown>;
  }>;
} {
  return (
    !!parsed &&
    typeof parsed === "object" &&
    "gameState" in parsed &&
    "events" in parsed &&
    "ghosts" in parsed
  );
}

function isMoveData(
  parsed: unknown,
): parsed is { yaw?: number; pitch?: number } {
  return !!parsed && typeof parsed === "object" && "yaw" in parsed;
}

function isInfoData(parsed: unknown): parsed is { value2: number } {
  return (
    !!parsed &&
    typeof parsed === "object" &&
    "value2" in parsed &&
    typeof (parsed as { value2?: unknown }).value2 === "number"
  );
}

function makeGhostKeyframe(
  time: number,
  data: Record<string, unknown>,
): TimelineGhostKeyframe {
  const kf: TimelineGhostKeyframe = { time, data };
  const position = data.position as
    | { x: number; y: number; z: number }
    | undefined;
  if (isValidPosition(position)) {
    kf.position = position;
  }
  if (data.rotation) {
    kf.rotation = data.rotation as TimelineGhostKeyframe["rotation"];
  }
  const velocity = data.velocity as
    | { x: number; y: number; z: number }
    | undefined;
  if (velocity) {
    kf.velocity = velocity;
  }
  return kf;
}

function buildMetadataRecording(
  header: DemoFile["header"],
  initialBlock: DemoFile["initialBlock"],
): DemoRecording {
  const { missionName: infoMissionName, gameType } = extractMissionInfo(
    initialBlock.demoValues,
  );
  return {
    duration: header.demoLengthMs / 1000,
    missionName: infoMissionName ?? initialBlock.missionName ?? null,
    gameType,
    entities: [],
    cameraModes: [],
    isMetadataOnly: true,
    isPartial: true,
  };
}

function createSteppedParseContextFromLoadedParser(
  parser: DemoParser,
  header: DemoFile["header"],
  initialBlock: DemoFile["initialBlock"],
): ParseStepContext {
  const registry = parser.getRegistry();

  const activeGhosts = new Map<number, TimelineGhostInstance>();
  const ghostInstances: TimelineGhostInstance[] = [];
  for (const ghost of initialBlock.initialGhosts) {
    if (ghost.type !== "create" || ghost.classId == null) continue;
    const className =
      registry.getGhostParser(ghost.classId)?.name ?? `ghost_${ghost.classId}`;
    const instance: TimelineGhostInstance = {
      ghostIndex: ghost.index,
      classId: ghost.classId,
      className,
      spawnTime: 0,
      keyframes: [],
    };
    if (ghost.parsedData) {
      instance.keyframes.push(makeGhostKeyframe(0, ghost.parsedData));
    }
    activeGhosts.set(ghost.index, instance);
    ghostInstances.push(instance);
  }

  return {
    parser,
    demo: {
      header,
      initialBlock,
      blocks: [],
    },
    timeline: {
      durationMs: 0,
      ghostInstances,
      controlObject: [],
      events: [],
      moveRotationsByPacket: [],
      cameraFovFrames: [],
    },
    activeGhosts,
    moveYawAccum: 0,
    movePitchAccum: 0,
    moveTicks: 0,
  };
}

async function createSteppedParseContext(
  data: ArrayBuffer,
): Promise<ParseStepContext> {
  const parser = new DemoParser(new Uint8Array(data));
  const { header, initialBlock } = await parser.load();
  return createSteppedParseContextFromLoadedParser(
    parser,
    header,
    initialBlock,
  );
}

function processSteppedBlocks(
  context: ParseStepContext,
  options?: ParseStepOptions,
): boolean {
  const parser = context.parser;
  const registry = parser.getRegistry();
  const timeline = context.timeline;
  const activeGhosts = context.activeGhosts;

  const batchSize = Math.max(1, options?.batchSize ?? Number.POSITIVE_INFINITY);
  let processed = 0;

  while (processed < batchSize) {
    const block = parser.nextBlock();
    if (!block) {
      timeline.durationMs = context.moveTicks * TICK_DURATION_MS;
      options?.onProgress?.({
        blockCursor: parser.blockCursor,
        moveTicks: context.moveTicks,
      });
      return true;
    }
    processed++;

    const currentTimeMs = context.moveTicks * TICK_DURATION_MS;

    if (block.type === BlockTypePacket && isPacketData(block.parsed)) {
      const packetIndex = timeline.moveRotationsByPacket.length;
      timeline.moveRotationsByPacket.push({
        yaw: context.moveYawAccum,
        pitch: context.movePitchAccum,
      });

      const packet = block.parsed;
      const coData = packet.gameState.controlObjectData;
      const rawPosition =
        (coData?.position as { x: number; y: number; z: number } | undefined) ??
        packet.gameState.compressionPoint;
      if (isValidPosition(rawPosition)) {
        timeline.controlObject.push({
          time: currentTimeMs,
          ghostIndex: packet.gameState.controlObjectGhostIndex ?? -1,
          position: rawPosition,
          velocity: coData?.velocity as
            | { x: number; y: number; z: number }
            | undefined,
          data: coData,
          packetIndex,
        });
      }

      for (const evt of packet.events) {
        timeline.events.push({
          time: currentTimeMs,
          type:
            registry.getEventParser(evt.classId)?.name ??
            `event_${evt.classId}`,
          classId: evt.classId,
          guaranteed: evt.guaranteed,
          data: evt.parsedData,
        });
      }

      for (const ghost of packet.ghosts) {
        if (ghost.type === "create" && ghost.classId != null) {
          const prev = activeGhosts.get(ghost.index);
          if (prev && prev.despawnTime == null) {
            prev.despawnTime = currentTimeMs;
          }
          const className =
            registry.getGhostParser(ghost.classId)?.name ??
            `ghost_${ghost.classId}`;
          const instance: TimelineGhostInstance = {
            ghostIndex: ghost.index,
            classId: ghost.classId,
            className,
            spawnTime: currentTimeMs,
            keyframes: [],
          };
          if (ghost.parsedData) {
            instance.keyframes.push(
              makeGhostKeyframe(currentTimeMs, ghost.parsedData),
            );
          }
          activeGhosts.set(ghost.index, instance);
          timeline.ghostInstances.push(instance);
          continue;
        }
        if (ghost.type === "update" && ghost.parsedData) {
          const instance = activeGhosts.get(ghost.index);
          if (instance) {
            instance.keyframes.push(
              makeGhostKeyframe(currentTimeMs, ghost.parsedData),
            );
          }
          continue;
        }
        if (ghost.type === "delete") {
          const instance = activeGhosts.get(ghost.index);
          if (instance) {
            instance.despawnTime = currentTimeMs;
            activeGhosts.delete(ghost.index);
          }
        }
      }
      continue;
    }

    if (block.type === BlockTypeInfo && isInfoData(block.parsed)) {
      const fov = block.parsed.value2;
      if (Number.isFinite(fov)) {
        const prev =
          timeline.cameraFovFrames[timeline.cameraFovFrames.length - 1];
        if (
          !prev ||
          prev.timeMs !== currentTimeMs ||
          Math.abs(prev.fov - fov) > 0.001
        ) {
          timeline.cameraFovFrames.push({ timeMs: currentTimeMs, fov });
        }
      }
      continue;
    }

    if (block.type === BlockTypeMove && isMoveData(block.parsed)) {
      context.moveYawAccum += block.parsed.yaw ?? 0;
      context.movePitchAccum += block.parsed.pitch ?? 0;
      context.moveTicks += 1;
      continue;
    }

    if (block.type === BlockTypeSendPacket) {
      continue;
    }
  }

  options?.onProgress?.({
    blockCursor: parser.blockCursor,
    moveTicks: context.moveTicks,
  });
  return false;
}

// Reusable temporaries for yawPitchToQuaternion.
const _mat = new Matrix4();
const _qResult = new Quaternion();

/**
 * Convert Torque yaw (rotZ) + pitch (rotX) to a Three.js camera quaternion.
 *
 * Camera::setPosition builds `temp.mul(zRot, xRot)` = Rz(yaw) * Rx(pitch)
 * using m_matF_set_euler's left-hand convention. Applied to Torque's forward
 * vector (0,1,0), this gives:
 *
 *   forward_torque = (sin(z)·cos(x),  cos(z)·cos(x),  -sin(x))
 *   up_torque      = (sin(z)·sin(x),  cos(z)·sin(x),   cos(x))
 *   right_torque   = (cos(z),         -sin(z),          0)
 *
 * Mapped to Three.js via the axis permutation (x,y,z) → (y,z,x):
 *
 *   forward = (cos(z)·cos(x),  -sin(x),       sin(z)·cos(x))
 *   up      = (cos(z)·sin(x),   cos(x),       sin(z)·sin(x))
 *   right   = (-sin(z),         0,             cos(z))
 *
 * The right vector has zero Y component at all times → no roll.
 */
function yawPitchToQuaternion(
  yaw: number,
  pitch: number,
): [number, number, number, number] {
  const sx = Math.sin(pitch);
  const cx = Math.cos(pitch);
  const sz = Math.sin(yaw);
  const cz = Math.cos(yaw);

  // Three.js camera rotation matrix columns: [right | up | backward].
  // backward = -forward. Built from Rz(yaw) * Rx(pitch) with axis permutation.
  _mat.set(
    -sz,
    cz * sx,
    -cz * cx,
    0,
    0,
    cx,
    sx,
    0,
    cz,
    sz * sx,
    -sz * cx,
    0,
    0,
    0,
    0,
    1,
  );

  _qResult.setFromRotationMatrix(_mat);
  return [_qResult.x, _qResult.y, _qResult.z, _qResult.w];
}

/**
 * Extract absolute yaw/pitch from a control object keyframe if available.
 *
 * Observer mode keyframes store rotation as `rotZ` (yaw) and `rotX` (pitch).
 * Player ghost keyframes store rotation as `rotationZ` (yaw) and `headX` (pitch).
 * Both are in radians.
 */
function getAbsoluteRotation(
  kf: ControlObjectKeyframe,
): { yaw: number; pitch: number } | null {
  if (!kf.data) return null;
  // Player ghost: rotationZ (yaw around Z) + headX (pitch around X).
  if (
    typeof kf.data.rotationZ === "number" &&
    typeof kf.data.headX === "number"
  ) {
    return { yaw: kf.data.rotationZ as number, pitch: kf.data.headX as number };
  }
  // Observer mode: rotZ (yaw) + rotX (pitch).
  if (typeof kf.data.rotZ === "number" && typeof kf.data.rotX === "number") {
    return { yaw: kf.data.rotZ as number, pitch: kf.data.rotX as number };
  }
  return null;
}

/** Camera mode constants from the Torque engine. Mode 3 = OrbitObjectMode. */
const CameraMode_OrbitObject = 3;

/** Max pitch (±89°) to prevent the camera from flipping upside-down. */
const MAX_PITCH = Math.PI * 0.494;

/**
 * Detect whether a control-object keyframe is from a Camera ghost or Player
 * ghost based on the data fields present. Camera readPacketData produces
 * `cameraMode`; Player readPacketData produces `rotationZ` + `headX`.
 * Returns "camera", "player", or null when the keyframe has no data
 * (compression-point-only update).
 */
function detectControlObjectType(
  kf: ControlObjectKeyframe,
): "camera" | "player" | null {
  if (!kf.data) return null;
  if (typeof kf.data.cameraMode === "number") return "camera";
  if (typeof kf.data.rotationZ === "number") return "player";
  return null;
}

/**
 * Build the camera entity from control object keyframes + move rotation data.
 * Also produces a CameraModeFrame timeline for visibility toggling.
 */
/** Entity ID for the recording player (the player controlling the camera). */
const RECORDING_PLAYER_ID = "recording_player";

function buildCameraEntity(
  demo: DemoFile,
  timeline: MoveDerivedTimeline,
  moveRotations: MoveRotationSample[],
  cameraFovFrames: CameraFovFrame[],
): {
  keyframes: DemoKeyframe[];
  cameraModes: CameraModeFrame[];
  duration: number;
  /** The recording player entity built from CO data (position + yaw). */
  recordingPlayer: DemoEntity | null;
} | null {
  const co = timeline.controlObject;
  if (co.length === 0) return null;

  // Build a lookup from ghostIndex → className for resolving orbit target
  // entity ID prefixes (player_ vs vehicle_).
  const ghostClassMap = new Map<number, string>();
  for (const ghost of timeline.ghostInstances) {
    ghostClassMap.set(ghost.ghostIndex, ghost.className);
  }

  // Resolve maxEnergy from the recording player's PlayerData datablock so
  // we can normalize the CO's absolute energyLevel to 0-1.
  let maxEnergy = 60; // Light armor default.
  const coGhostIndex = co[0]?.ghostIndex;
  if (coGhostIndex != null && coGhostIndex >= 0) {
    const ghost = timeline.ghostInstances.find(
      (g) => g.ghostIndex === coGhostIndex && g.className === "Player",
    );
    if (ghost) {
      for (const gkf of ghost.keyframes) {
        if (gkf.data?.dataBlockId != null) {
          const block = demo.initialBlock.dataBlocks.get(
            gkf.data.dataBlockId as number,
          );
          if (block?.data?.maxEnergy != null) {
            maxEnergy = block.data.maxEnergy as number;
          }
          break;
        }
      }
    }
  }

  // Pre-scan to initialize offsets from the first keyframe with absolute
  // rotation. Without this, keyframes before the first rotation data would
  // use raw move accumulation starting from (0,0).
  let yawOffset = 0;
  let pitchOffset = 0;
  for (let i = 0; i < co.length; i++) {
    const absRot = getAbsoluteRotation(co[i]);
    if (absRot) {
      const packetIndex = co[i].packetIndex ?? i;
      yawOffset =
        absRot.yaw -
        (packetIndex < moveRotations.length
          ? moveRotations[packetIndex].yaw
          : 0);
      pitchOffset =
        absRot.pitch -
        (packetIndex < moveRotations.length
          ? moveRotations[packetIndex].pitch
          : 0);
      break;
    }
  }

  const keyframes: DemoKeyframe[] = [];
  const cameraModes: CameraModeFrame[] = [];
  // Position keyframes for the recording player entity (only body yaw, no pitch).
  const playerKeyframes: DemoKeyframe[] = [];
  let lastAbsYaw = yawOffset;
  let lastAbsPitch = pitchOffset;
  // Track whether the player is piloting a vehicle. When piloting, move
  // deltas represent vehicle steering rather than camera rotation.
  let isPiloting = false;
  // Track the last known control object type for keyframes without data.
  let lastCoType: "camera" | "player" = "player";

  // Track raw yaw/pitch alongside keyframes for post-processing.
  // Move-accumulated rotation can drift from ground truth; a post-processing
  // step scales the move dynamics within each gap to match the ABS endpoints.
  const rawRotation: {
    yaw: number;
    pitch: number;
    isAbsolute: boolean;
    moveYaw: number;
    movePitch: number;
  }[] = [];
  const playerKfRawIdx: number[] = [];
  let fovFrameIndex = 0;
  let currentFov: number | undefined = 100;

  for (let i = 0; i < co.length; i++) {
    const kf = co[i];
    if (!kf.position) continue;

    const timeSec = kf.time / 1000;
    const packetIndex = kf.packetIndex ?? i;

    while (
      fovFrameIndex < cameraFovFrames.length &&
      cameraFovFrames[fovFrameIndex].timeMs <= kf.time
    ) {
      currentFov = cameraFovFrames[fovFrameIndex].fov;
      fovFrameIndex += 1;
    }

    // Detect control object type from data fields (not ghost index lookup).
    const coType = detectControlObjectType(kf);
    if (coType) lastCoType = coType;

    // Update piloting state from Player data when available.
    if (kf.data && coType === "player") {
      isPiloting = !!(kf.data.pilot || kf.data.controlObjectGhost != null);
    } else if (coType === "camera") {
      isPiloting = false;
    }

    let yaw: number;
    let pitch: number;

    const absRot = getAbsoluteRotation(kf);

    // Move prediction using the pre-sync offset (before any ABS re-sync).
    // For non-ABS frames this equals yaw/pitch; for ABS frames it's what
    // the moves would have predicted without the ABS override.
    const hasMoves =
      !isPiloting &&
      lastCoType === "player" &&
      packetIndex < moveRotations.length;
    const moveYaw = hasMoves
      ? moveRotations[packetIndex].yaw + yawOffset
      : lastAbsYaw;
    const movePitch = hasMoves
      ? moveRotations[packetIndex].pitch + pitchOffset
      : lastAbsPitch;

    if (absRot) {
      // Use absolute rotation from ghost data (observer or player).
      yaw = absRot.yaw;
      pitch = absRot.pitch;
      lastAbsYaw = yaw;
      lastAbsPitch = pitch;
      // Sync move offsets so interpolation continues smoothly.
      if (packetIndex < moveRotations.length) {
        yawOffset = yaw - moveRotations[packetIndex].yaw;
        pitchOffset = pitch - moveRotations[packetIndex].pitch;
      }
    } else if (hasMoves) {
      // No absolute rotation: use accumulated move deltas + offset.
      // Only valid for on-foot Player — in vehicles or Camera mode, move
      // deltas don't represent camera rotation.
      yaw = moveYaw;
      pitch = movePitch;
      lastAbsYaw = yaw;
      lastAbsPitch = pitch;
    } else {
      yaw = lastAbsYaw;
      pitch = lastAbsPitch;
    }

    // Clamp pitch to prevent the camera from flipping upside-down.
    pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));

    rawRotation.push({ yaw, pitch, isAbsolute: !!absRot, moveYaw, movePitch });

    // Determine camera mode. Eye height offset for first-person mode is
    // applied at render time using the Cam node from the player's shape.
    let modeFrame: CameraModeFrame;

    if (lastCoType === "camera") {
      // Camera ghost — position is already the final camera position.
      const cameraMode = kf.data?.cameraMode as number | undefined;
      if (cameraMode === CameraMode_OrbitObject) {
        // Third-person: orbiting another ghost.
        const orbitGhostIndex = kf.data?.orbitObjectGhostIndex as
          | number
          | undefined;
        let orbitTargetId: string | undefined;
        if (orbitGhostIndex != null) {
          const orbitClass = ghostClassMap.get(orbitGhostIndex);
          const prefix =
            orbitClass && vehicleClassNames.has(orbitClass)
              ? "vehicle"
              : "player";
          orbitTargetId = `${prefix}_${orbitGhostIndex}`;
        }
        modeFrame = {
          time: timeSec,
          mode: "third-person",
          orbitTargetId,
        };
      } else {
        // Free/stationary/fly camera.
        modeFrame = { time: timeSec, mode: "observer" };
      }
    } else {
      // Player control object — position is at the player's feet.
      modeFrame = {
        time: timeSec,
        mode: "first-person",
        controlEntityId: RECORDING_PLAYER_ID,
      };
    }

    keyframes.push({
      time: timeSec,
      position: [kf.position.x, kf.position.y, kf.position.z],
      rotation: yawPitchToQuaternion(yaw, pitch),
      fov: currentFov,
    });

    // Build a parallel position keyframe for the recording player entity
    // using only body yaw (not pitch — the player model doesn't pitch).
    if (lastCoType === "player") {
      const coVel = kf.data?.velocity as
        | { x: number; y: number; z: number }
        | undefined;
      // CO readPacketData gives energyLevel (absolute F32); normalize to 0-1.
      const coEnergy = kf.data?.energyLevel as number | undefined;
      playerKeyframes.push({
        time: timeSec,
        position: [kf.position.x, kf.position.y, kf.position.z],
        rotation: playerYawToQuaternion(yaw),
        velocity: coVel ? [coVel.x, coVel.y, coVel.z] : undefined,
        energy:
          coEnergy != null && maxEnergy > 0
            ? Math.max(0, Math.min(1, coEnergy / maxEnergy))
            : undefined,
      });
      playerKfRawIdx.push(rawRotation.length - 1);
    }

    // Only emit a camera mode frame when the mode actually changes.
    const prev = cameraModes[cameraModes.length - 1];
    if (
      !prev ||
      prev.mode !== modeFrame.mode ||
      prev.controlEntityId !== modeFrame.controlEntityId ||
      prev.orbitTargetId !== modeFrame.orbitTargetId
    ) {
      cameraModes.push(modeFrame);
    }
  }

  // Post-process: fix rotation drift in gaps between absolute keyframes.
  // Near gimbal lock (pitch ≈ ±90°), accumulated move deltas can diverge
  // significantly from the server's actual rotation. Rather than replacing the
  // move data with linear interpolation, we SCALE the move dynamics within each
  // gap so the total rotation matches the ABS endpoints while preserving the
  // relative timing and magnitude of the player's mouse movements.
  {
    let lastAbsI = -1;
    for (let i = 0; i < rawRotation.length; i++) {
      if (!rawRotation[i].isAbsolute) continue;
      if (lastAbsI >= 0 && i > lastAbsI + 1) {
        const y0 = rawRotation[lastAbsI].yaw;
        const p0 = rawRotation[lastAbsI].pitch;

        // What the ABS endpoints say the total delta should be.
        let absYawDelta = rawRotation[i].yaw - y0;
        // Shortest angular path.
        absYawDelta -= Math.round(absYawDelta / (2 * Math.PI)) * (2 * Math.PI);
        const absPitchDelta = rawRotation[i].pitch - p0;

        // What the moves accumulated to over this gap.
        const moveYawDelta =
          rawRotation[i].moveYaw - rawRotation[lastAbsI].moveYaw;
        const movePitchDelta =
          rawRotation[i].movePitch - rawRotation[lastAbsI].movePitch;

        // Scale moves to match ABS delta. Fall back to linear interpolation
        // if the move delta is near-zero or in the opposite direction.
        const MIN_MOVE = 0.01; // ~0.6°
        const dt = keyframes[i].time - keyframes[lastAbsI].time;

        const canScaleYaw =
          Math.abs(moveYawDelta) > MIN_MOVE &&
          Math.sign(moveYawDelta) === Math.sign(absYawDelta);
        const canScalePitch =
          Math.abs(movePitchDelta) > MIN_MOVE &&
          Math.sign(movePitchDelta) === Math.sign(absPitchDelta);

        const yawScale = canScaleYaw ? absYawDelta / moveYawDelta : 0;
        const pitchScale = canScalePitch ? absPitchDelta / movePitchDelta : 0;

        for (let j = lastAbsI + 1; j < i; j++) {
          if (canScaleYaw) {
            // Scale the move-predicted offset from the start of the gap.
            const moveFrac =
              rawRotation[j].moveYaw - rawRotation[lastAbsI].moveYaw;
            rawRotation[j].yaw = y0 + moveFrac * yawScale;
          } else {
            // Pathological case: linear interpolation fallback.
            const t = (keyframes[j].time - keyframes[lastAbsI].time) / dt;
            rawRotation[j].yaw = y0 + t * absYawDelta;
          }

          if (canScalePitch) {
            const moveFrac =
              rawRotation[j].movePitch - rawRotation[lastAbsI].movePitch;
            rawRotation[j].pitch = p0 + moveFrac * pitchScale;
          } else {
            const t = (keyframes[j].time - keyframes[lastAbsI].time) / dt;
            rawRotation[j].pitch = p0 + t * absPitchDelta;
          }
        }
      }
      lastAbsI = i;
    }

    // Recompute quaternions from (possibly corrected) yaw/pitch and normalize
    // consecutive quaternions to the same hemisphere for stable slerp.
    let prevQ: [number, number, number, number] | null = null;
    for (let i = 0; i < keyframes.length; i++) {
      const q = yawPitchToQuaternion(rawRotation[i].yaw, rawRotation[i].pitch);
      if (prevQ) {
        const dot =
          q[0] * prevQ[0] + q[1] * prevQ[1] + q[2] * prevQ[2] + q[3] * prevQ[3];
        if (dot < 0) {
          q[0] = -q[0];
          q[1] = -q[1];
          q[2] = -q[2];
          q[3] = -q[3];
        }
      }
      keyframes[i] = { ...keyframes[i], rotation: q };
      prevQ = q;
    }

    // Update player keyframe rotation from corrected yaw.
    for (let j = 0; j < playerKfRawIdx.length; j++) {
      playerKeyframes[j] = {
        ...playerKeyframes[j],
        rotation: playerYawToQuaternion(rawRotation[playerKfRawIdx[j]].yaw),
      };
    }
  }

  if (keyframes.length === 0) return null;

  const duration = keyframes[keyframes.length - 1].time;

  // Build the recording player entity. The control object channel doesn't
  // include ghost data (weapon/armor), so we default to light armor with a
  // disc launcher. The body is hidden in first-person anyway; only the weapon
  // is visible.
  const recordingPlayer: DemoEntity | null =
    playerKeyframes.length > 0
      ? {
          id: RECORDING_PLAYER_ID,
          type: "Player",
          dataBlock: "light_male.dts",
          weaponShape: "weapon_disc.dts",
          keyframes: playerKeyframes,
        }
      : null;

  return { keyframes, cameraModes, duration, recordingPlayer };
}

/**
 * Convert Torque player yaw (rotationZ) to a Three.js quaternion.
 *
 * Player body only rotates around yaw — no pitch/roll on the body mesh.
 * Torque's left-hand rotZ maps to Three.js Ry(-rotZ).
 */
function playerYawToQuaternion(rotZ: number): [number, number, number, number] {
  const halfAngle = -rotZ / 2;
  return [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)];
}

/** Validate that a ghost position has finite coordinates. */
function isValidPosition(
  pos: { x: number; y: number; z: number } | undefined | null,
): pos is { x: number; y: number; z: number } {
  return (
    pos != null &&
    Number.isFinite(pos.x) &&
    Number.isFinite(pos.y) &&
    Number.isFinite(pos.z)
  );
}

/**
 * Convert a Torque quaternion to Three.js space.
 *
 * This matches `mission.getRotation()` semantics:
 * 1) axis swizzle (x,y,z)->(y,z,x)
 * 2) inverted rotation direction (negated imaginary components)
 */
function torqueQuatToThreeJS(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): [number, number, number, number] | null {
  const out: [number, number, number, number] = [-q.y, -q.z, -q.x, q.w];
  // Validate: all components must be finite.
  if (!out.every(Number.isFinite)) return null;
  // Normalize: must have non-zero magnitude.
  const mag = Math.sqrt(out[0] ** 2 + out[1] ** 2 + out[2] ** 2 + out[3] ** 2);
  if (mag < 1e-6) return null;
  out[0] /= mag;
  out[1] /= mag;
  out[2] /= mag;
  out[3] /= mag;
  return out;
}

/**
 * Produce unique entity IDs when a ghost index is reused across ghost
 * lifecycles (delete + create on the same slot).
 */
function uniqueId(
  seenIds: Map<string, number>,
  prefix: string,
  ghostIndex: number,
): string {
  const base = `${prefix}_${ghostIndex}`;
  const count = seenIds.get(base) ?? 0;
  seenIds.set(base, count + 1);
  return count === 0 ? base : `${base}_${count}`;
}

/**
 * Scan a ghost's keyframes for the first dataBlockId that resolves to a
 * datablock of the given class(es) with a shapeName.
 */
function resolveShapeName(
  keyframes: { data?: Record<string, unknown> }[],
  dataBlocks: Map<number, { className: string; data: Record<string, unknown> }>,
  allowedClasses?: Set<string>,
): string | undefined {
  for (const kf of keyframes) {
    if (kf.data?.dataBlockId != null) {
      const block = dataBlocks.get(kf.data.dataBlockId as number);
      const name = (block?.data?.shapeName ??
        block?.data?.projectileShapeName) as string | undefined;
      if (!name) continue;
      if (allowedClasses && !allowedClasses.has(block.className)) continue;
      return name;
    }
  }
  return undefined;
}

/**
 * Build DemoEntity entries for all Player ghosts in the timeline.
 *
 * Ghost data in the demo format is sparse — position updates are only sent
 * when the MoveMask flag is set. Players may have very few keyframes if they
 * are only briefly in the recorder's ghost scope.
 */
function buildPlayerEntities(
  demo: DemoFile,
  timeline: MoveDerivedTimeline,
  seenIds: Map<string, number>,
): DemoEntity[] {
  const entities: DemoEntity[] = [];
  const dataBlocks = demo.initialBlock.dataBlocks;

  for (const ghost of timeline.ghostInstances) {
    if (ghost.className !== "Player") continue;
    if (ghost.keyframes.length === 0) continue;

    // Resolve player shape from the PlayerData datablock. Falls back to
    // "light_male.dts" when the initial block ghost data lacks a dataBlockId
    // (t2-demo-parser doesn't yet save parsedData for initial block ghosts).
    const shapeName =
      resolveShapeName(ghost.keyframes, dataBlocks, playerDataClasses) ??
      "light_male.dts";

    // Resolve weapon shape from image slot 0 (the weapon slot).
    // Weapons use mountPoint 0 (right hand); packs use mountPoint 1 (back).
    let weaponShape: string | undefined;
    for (const kf of ghost.keyframes) {
      const images = kf.data?.images as
        | Array<{ dataBlockId?: number }>
        | undefined;
      if (!images || images.length === 0) continue;
      const weaponImg = images[0];
      if (weaponImg?.dataBlockId && weaponImg.dataBlockId > 0) {
        const block = dataBlocks.get(weaponImg.dataBlockId);
        if (!block?.data?.shapeName) continue;
        // Skip packs/equipment: they set mountPoint > 0 or have pack-like names.
        const mountPoint = block.data.mountPoint as number | undefined;
        if (mountPoint != null && mountPoint > 0) continue;
        const shape = block.data.shapeName as string;
        if (/pack_/i.test(shape)) continue;
        weaponShape = shape;
        break;
      }
    }

    // Build keyframes, carrying forward last known position/rotation/velocity.
    const keyframes: DemoKeyframe[] = [];
    let lastPos: [number, number, number] | null = null;
    let lastRotZ = 0;
    let lastVelocity: [number, number, number] | null = null;
    let lastHealth: number | undefined;
    let lastEnergy: number | undefined;

    for (const kf of ghost.keyframes) {
      const timeSec = kf.time / 1000;

      if (isValidPosition(kf.position)) {
        lastPos = [kf.position.x, kf.position.y, kf.position.z];
      }
      if (kf.data?.rotationZ != null) {
        lastRotZ = kf.data.rotationZ as number;
      }
      const vel = kf.data?.velocity as
        | { x: number; y: number; z: number }
        | undefined;
      if (vel) {
        lastVelocity = [vel.x, vel.y, vel.z];
      }
      // damageLevel is 0 (no damage) to 1 (dead); invert to get health.
      if (typeof kf.data?.damageLevel === "number") {
        lastHealth = 1 - (kf.data.damageLevel as number);
      }
      // Player ghosts have an unconditional `energy` field (5-bit float, 0-1)
      // after the MoveMask section. For the recording player's ghost, the
      // control-object shortcut causes early return before this field, so we
      // fall back to the conditional `energyPercent` from ShapeBase state.
      if (typeof kf.data?.energy === "number") {
        lastEnergy = kf.data.energy as number;
      } else if (typeof kf.data?.energyPercent === "number") {
        lastEnergy = kf.data.energyPercent as number;
      }

      if (!lastPos) continue;

      keyframes.push({
        time: timeSec,
        position: lastPos,
        rotation: playerYawToQuaternion(lastRotZ),
        velocity: lastVelocity ?? undefined,
        health: lastHealth,
        energy: lastEnergy,
      });
    }

    if (keyframes.length === 0) continue;

    entities.push({
      id: uniqueId(seenIds, "player", ghost.ghostIndex),
      type: "Player",
      dataBlock: shapeName,
      spawnTime: ghost.spawnTime / 1000,
      despawnTime:
        ghost.despawnTime != null ? ghost.despawnTime / 1000 : undefined,
      keyframes,
      weaponShape,
    });
  }

  return entities;
}

const playerDataClasses = new Set(["PlayerData"]);

const vehicleClassNames = new Set([
  "FlyingVehicle",
  "HoverVehicle",
  "WheeledVehicle",
]);

const projectileClassNames = new Set([
  "BombProjectile",
  "EnergyProjectile",
  "FlareProjectile",
  "GrenadeProjectile",
  "LinearFlareProjectile",
  "LinearProjectile",
  "Projectile",
  "SeekerProjectile",
  "TracerProjectile",
]);

const vehicleDataClassNames = new Set([
  "FlyingVehicleData",
  "HoverVehicleData",
  "WheeledVehicleData",
]);

/** Ghost classes that use the StaticShape parser (affine transform for position). */
const deployableClassNames = new Set([
  "StaticShape",
  "ScopeAlwaysShape",
  "Turret",
  "BeaconObject",
  "ForceFieldBare",
]);

/** Build DemoEntity entries for vehicle ghosts in the timeline. */
function buildVehicleEntities(
  demo: DemoFile,
  timeline: MoveDerivedTimeline,
  seenIds: Map<string, number>,
): DemoEntity[] {
  const entities: DemoEntity[] = [];
  const dataBlocks = demo.initialBlock.dataBlocks;

  for (const ghost of timeline.ghostInstances) {
    if (!vehicleClassNames.has(ghost.className)) continue;
    if (ghost.keyframes.length === 0) continue;

    const shapeName = resolveShapeName(
      ghost.keyframes,
      dataBlocks,
      vehicleDataClassNames,
    );

    // Build keyframes, carrying forward last known position/rotation.
    const keyframes: DemoKeyframe[] = [];
    let lastPos: [number, number, number] | null = null;
    let lastRot: [number, number, number, number] = [0, 0, 0, 1];

    for (const kf of ghost.keyframes) {
      const timeSec = kf.time / 1000;

      if (isValidPosition(kf.position)) {
        lastPos = [kf.position.x, kf.position.y, kf.position.z];
      }
      if (kf.data?.angPosition) {
        const q = kf.data.angPosition as {
          x: number;
          y: number;
          z: number;
          w: number;
        };
        const converted = torqueQuatToThreeJS(q);
        if (converted) lastRot = converted;
      }

      if (!lastPos) continue;

      keyframes.push({
        time: timeSec,
        position: lastPos,
        rotation: lastRot,
      });
    }

    if (keyframes.length === 0) continue;

    entities.push({
      id: uniqueId(seenIds, "vehicle", ghost.ghostIndex),
      type: "Vehicle",
      dataBlock: shapeName,
      spawnTime: ghost.spawnTime / 1000,
      despawnTime:
        ghost.despawnTime != null ? ghost.despawnTime / 1000 : undefined,
      keyframes,
    });
  }

  return entities;
}

/** Build DemoEntity entries for Item ghosts (e.g. dropped flags). */
function buildItemEntities(
  demo: DemoFile,
  timeline: MoveDerivedTimeline,
  seenIds: Map<string, number>,
): DemoEntity[] {
  const entities: DemoEntity[] = [];
  const dataBlocks = demo.initialBlock.dataBlocks;

  for (const ghost of timeline.ghostInstances) {
    if (ghost.className !== "Item") continue;
    if (ghost.keyframes.length === 0) continue;

    const shapeName = resolveShapeName(ghost.keyframes, dataBlocks);

    // Build keyframes. Items only get position updates when moving/thrown.
    // Rotation is a single-axis Z angle (zSign * angle) when the item isn't
    // set to auto-rotate. Torque Z-axis → Three.js Y-axis.
    const keyframes: DemoKeyframe[] = [];
    let lastPos: [number, number, number] | null = null;
    let lastRot: [number, number, number, number] = [0, 0, 0, 1];

    for (const kf of ghost.keyframes) {
      const timeSec = kf.time / 1000;

      if (isValidPosition(kf.position)) {
        lastPos = [kf.position.x, kf.position.y, kf.position.z];
      }

      // Item rotation: { zSign: ±1, angle: number } → Y-axis quaternion.
      const rot = kf.data?.rotation as
        | { zSign: number; angle: number }
        | undefined;
      if (rot && typeof rot.angle === "number") {
        lastRot = playerYawToQuaternion(rot.zSign * rot.angle);
      }

      if (!lastPos) continue;

      keyframes.push({
        time: timeSec,
        position: lastPos,
        rotation: lastRot,
      });
    }

    if (keyframes.length === 0) continue;

    entities.push({
      id: uniqueId(seenIds, "item", ghost.ghostIndex),
      type: "Item",
      dataBlock: shapeName,
      spawnTime: ghost.spawnTime / 1000,
      despawnTime:
        ghost.despawnTime != null ? ghost.despawnTime / 1000 : undefined,
      keyframes,
    });
  }

  return entities;
}

/** Build DemoEntity entries for projectile ghosts. */
function buildProjectileEntities(
  demo: DemoFile,
  timeline: MoveDerivedTimeline,
  seenIds: Map<string, number>,
): DemoEntity[] {
  const entities: DemoEntity[] = [];
  const dataBlocks = demo.initialBlock.dataBlocks;

  for (const ghost of timeline.ghostInstances) {
    if (!projectileClassNames.has(ghost.className)) continue;
    if (ghost.keyframes.length === 0) continue;

    const shapeName = resolveShapeName(ghost.keyframes, dataBlocks);

    // Build keyframes, carrying forward last known position/rotation.
    const keyframes: DemoKeyframe[] = [];
    let lastPos: [number, number, number] | null = null;
    let lastRot: [number, number, number, number] = [0, 0, 0, 1];

    for (const kf of ghost.keyframes) {
      const timeSec = kf.time / 1000;

      if (isValidPosition(kf.position)) {
        lastPos = [kf.position.x, kf.position.y, kf.position.z];
      }

      // Derive facing yaw from velocity or direction vectors.
      // atan2(x, y) gives the angle from Torque's forward (+Y) toward +X.
      const vel = kf.data?.velocity as
        | { x: number; y: number; z: number }
        | undefined;
      const dir = kf.data?.direction as
        | { x: number; y: number; z: number }
        | undefined;
      const vec = vel ?? dir;
      if (vec && (vec.x !== 0 || vec.y !== 0)) {
        lastRot = playerYawToQuaternion(Math.atan2(vec.x, vec.y));
      }

      if (!lastPos) continue;

      keyframes.push({
        time: timeSec,
        position: lastPos,
        rotation: lastRot,
      });
    }

    if (keyframes.length === 0) continue;

    entities.push({
      id: uniqueId(seenIds, "projectile", ghost.ghostIndex),
      type: "Projectile",
      dataBlock: shapeName,
      spawnTime: ghost.spawnTime / 1000,
      despawnTime:
        ghost.despawnTime != null ? ghost.despawnTime / 1000 : undefined,
      keyframes,
    });
  }

  return entities;
}

/**
 * Build DemoEntity entries for deployable/static ghosts (turrets, sensors,
 * inventory stations, force fields, beacons, etc.).
 *
 * These use an affine transform (position + quaternion) via the PositionMask.
 * Only ghosts created during the demo will typically have valid position data;
 * pre-existing ones from the initial block rarely receive a PositionMask update.
 */
function buildDeployableEntities(
  demo: DemoFile,
  timeline: MoveDerivedTimeline,
  seenIds: Map<string, number>,
): DemoEntity[] {
  const entities: DemoEntity[] = [];
  const dataBlocks = demo.initialBlock.dataBlocks;

  for (const ghost of timeline.ghostInstances) {
    if (!deployableClassNames.has(ghost.className)) continue;
    if (ghost.keyframes.length === 0) continue;

    const shapeName = resolveShapeName(ghost.keyframes, dataBlocks);

    // Build keyframes from transform data. Deployables are mostly static,
    // so position rarely changes after the initial placement.
    const keyframes: DemoKeyframe[] = [];
    let lastPos: [number, number, number] | null = null;
    let lastRot: [number, number, number, number] = [0, 0, 0, 1];

    for (const kf of ghost.keyframes) {
      const timeSec = kf.time / 1000;

      // StaticShape/Turret/etc. store position via transform.position (affine).
      const transform = kf.data?.transform as
        | {
            position: { x: number; y: number; z: number };
            rotation: { x: number; y: number; z: number; w: number };
          }
        | undefined;

      if (transform && isValidPosition(transform.position)) {
        lastPos = [
          transform.position.x,
          transform.position.y,
          transform.position.z,
        ];
        const converted = torqueQuatToThreeJS(transform.rotation);
        if (converted) lastRot = converted;
      }

      if (!lastPos) continue;

      keyframes.push({
        time: timeSec,
        position: lastPos,
        rotation: lastRot,
      });
    }

    if (keyframes.length === 0) continue;

    entities.push({
      id: uniqueId(seenIds, "deployable", ghost.ghostIndex),
      type: "Deployable",
      dataBlock: shapeName,
      spawnTime: ghost.spawnTime / 1000,
      despawnTime:
        ghost.despawnTime != null ? ghost.despawnTime / 1000 : undefined,
      keyframes,
    });
  }

  return entities;
}

/**
 * Resolve player names from the demo's target system.
 *
 * The chain is: player ghost has `targetId` (9-bit) → `TargetInfoEvent`
 * maps targetId → `nameTag` (string table ID) → `NetStringEvent` populates
 * the string table with the actual name string.
 */
/** Strip Torque tagged-string control characters (color push/pop codes). */
function stripTaggedStringMarkup(s: string): string {
  let stripped = "";
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 0x20) {
      stripped += s[i];
    }
  }
  return stripped;
}

function resolvePlayerNames(
  demo: DemoFile,
  timeline: MoveDerivedTimeline,
): Map<number, string> {
  // Seed the string table from the initial block's 1024-entry tagged strings,
  // then overlay with NetStringEvent events from the packet stream.
  const stringTable = new Map<number, string>(demo.initialBlock.taggedStrings);
  for (const evt of timeline.events) {
    if (evt.type === "NetStringEvent" && evt.data) {
      stringTable.set(evt.data.id as number, evt.data.value as string);
    }
  }

  // Seed targetId → name from the initial block's Complex TargetManager
  // entries (players who existed before recording started), then overlay
  // with TargetInfoEvent events from the packet stream.
  const targetNames = new Map<number, string>();
  for (const entry of demo.initialBlock.targetEntries) {
    if (entry.name) {
      targetNames.set(entry.targetId, stripTaggedStringMarkup(entry.name));
    }
  }
  for (const evt of timeline.events) {
    if (evt.type === "TargetInfoEvent" && evt.data?.nameTag != null) {
      const nameTag = evt.data.nameTag as number;
      const name = stringTable.get(nameTag);
      if (name) {
        targetNames.set(
          evt.data.targetId as number,
          stripTaggedStringMarkup(name),
        );
      }
    }
  }

  // Map ghostIndex → name by scanning player ghosts for their targetId.
  const ghostNames = new Map<number, string>();
  for (const ghost of timeline.ghostInstances) {
    if (ghost.className !== "Player") continue;
    if (ghostNames.has(ghost.ghostIndex)) continue;
    for (const kf of ghost.keyframes) {
      const tid = kf.data?.targetId as number | undefined;
      if (tid != null && tid >= 0) {
        const name = targetNames.get(tid);
        if (name) {
          ghostNames.set(ghost.ghostIndex, name);
          break;
        }
      }
    }
  }

  return ghostNames;
}

function buildRecordingFromTimeline(
  demo: DemoFile,
  timeline: MoveDerivedTimeline,
): DemoRecording {
  const fallbackDurationSec =
    timeline.durationMs > 0
      ? timeline.durationMs / 1000
      : demo.header.demoLengthMs / 1000;

  const { missionName: infoMissionName, gameType } = extractMissionInfo(
    demo.initialBlock.demoValues,
  );
  const missionName = infoMissionName ?? demo.initialBlock.missionName ?? null;

  const seenIds = new Map<string, number>();
  const camera = buildCameraEntity(
    demo,
    timeline,
    timeline.moveRotationsByPacket,
    timeline.cameraFovFrames,
  );
  const playerEntities = buildPlayerEntities(demo, timeline, seenIds);
  const vehicleEntities = buildVehicleEntities(demo, timeline, seenIds);
  const itemEntities = buildItemEntities(demo, timeline, seenIds);
  const projectileEntities = buildProjectileEntities(demo, timeline, seenIds);
  const deployableEntities = buildDeployableEntities(demo, timeline, seenIds);

  // Resolve player names from the target system event stream.
  const ghostNames = resolvePlayerNames(demo, timeline);
  for (const entity of playerEntities) {
    const match = String(entity.id).match(/^player_(\d+)/);
    if (match) {
      const name = ghostNames.get(Number(match[1]));
      if (name) entity.playerName = name;
    }
  }

  const entities: DemoEntity[] = [];
  if (camera) {
    entities.push({
      id: "camera",
      type: "Camera",
      keyframes: camera.keyframes,
    });
    if (camera.recordingPlayer) {
      entities.push(camera.recordingPlayer);
    }
  }
  entities.push(
    ...playerEntities,
    ...vehicleEntities,
    ...itemEntities,
    ...projectileEntities,
    ...deployableEntities,
  );

  // Find the ghost entity ID corresponding to the recording player so that
  // consumers (e.g. HUD) can look up health/energy from the ghost data.
  let controlPlayerGhostId: string | undefined;
  for (const kf of timeline.controlObject) {
    if (detectControlObjectType(kf) === "player" && kf.ghostIndex >= 0) {
      const ghostId = `player_${kf.ghostIndex}`;
      if (playerEntities.some((e) => e.id === ghostId)) {
        controlPlayerGhostId = ghostId;
      }
      break;
    }
  }

  // Also assign the recording player's name from its ghost counterpart.
  if (controlPlayerGhostId && camera?.recordingPlayer) {
    const ghostEntity = playerEntities.find(
      (e) => e.id === controlPlayerGhostId,
    );
    if (ghostEntity?.playerName) {
      camera.recordingPlayer.playerName = ghostEntity.playerName;
    }
  }

  return {
    duration: camera?.duration ?? fallbackDurationSec,
    missionName,
    gameType,
    entities,
    cameraModes: camera?.cameraModes ?? [],
    controlPlayerGhostId,
    isMetadataOnly: false,
    isPartial: false,
  };
}

async function parseContextToRecording(
  context: ParseStepContext,
  options?: ParseStepOptions,
): Promise<DemoRecording> {
  while (!processSteppedBlocks(context, options)) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return buildRecordingFromTimeline(context.demo, context.timeline);
}

export async function createDemoParseSession(
  data: ArrayBuffer,
): Promise<DemoParseSession> {
  const context = await createSteppedParseContext(data);
  const metadata = buildMetadataRecording(
    context.demo.header,
    context.demo.initialBlock,
  );
  let parsePromise: Promise<DemoRecording> | null = null;

  return {
    metadata,
    parseRecording(options?: ParseStepOptions) {
      if (!parsePromise) {
        parsePromise = parseContextToRecording(context, options);
      }
      return parsePromise;
    },
  };
}

/** Parse a Tribes 2 .rec demo file into a DemoRecording. */
export async function parseDemoFile(data: ArrayBuffer): Promise<DemoRecording> {
  const session = await createDemoParseSession(data);
  return session.parseRecording();
}

/** Parse a Tribes 2 .rec demo file incrementally in small batches. */
export async function parseDemoFileIncremental(
  data: ArrayBuffer,
  options?: ParseStepOptions,
): Promise<DemoRecording> {
  const session = await createDemoParseSession(data);
  return session.parseRecording(options);
}
