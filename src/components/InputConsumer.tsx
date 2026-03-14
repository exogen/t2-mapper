import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Camera, Euler, Vector3 } from "three";
import { createLogger } from "../logger";
import {
  liveConnectionStore,
  useLiveSelector,
} from "../state/liveConnectionStore";
import { useEngineStoreApi } from "../state/engineStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { useInputContext } from "./InputContext";
import { useTick, useGetTickFraction } from "./TickProvider";
import { yawPitchToQuaternion, MAX_PITCH } from "../stream/streamHelpers";
import type { StreamRecording, StreamCamera } from "../stream/types";
import type { LiveStreamAdapter } from "../stream/liveStreaming";
import type { ClientMove } from "../../relay/types";

const log = createLogger("InputConsumer");

const MAX_SPEED = 300;
const LOCAL_MAX_PITCH = Math.PI / 2 - 0.01; // ~89°

/**
 * Max moves in the unacked buffer. Matches Torque's MaxMoveQueueSize.
 * Also the max we can send per packet (5-bit count = 31), but we keep
 * a slightly larger buffer to avoid losing moves during high latency.
 */
const MAX_MOVE_BUFFER = 45;

/** Max moves per packet (MoveCountBits = 5 → 2^5 - 1). */
const MAX_MOVES_PER_PACKET = 31;

/**
 * $Camera::movementSpeed (default 40 in Tribes2.exe at _DAT_0079abe8).
 * With trigger[1] (altTrigger) always set, the effective speed is 80.
 */
const CAMERA_SPEED = 40;

/** Torque tick duration in seconds (1/32 = 0.03125). */
const TICK_SEC = 1 / 32;

const M_2PI = 2 * Math.PI;

/**
 * Quantize a rotation delta through Torque's Move clamp/unclamp round-trip.
 * This ensures our predicted rotation exactly matches the server's decoded value.
 *
 * clamp:   pyaw = (radians / 2π) * 65536, masked to 16 bits
 * unclamp: radians = (short)pyaw * 2π / 65536
 */
function quantizeRotation(radians: number): number {
  const packed = Math.round((radians / M_2PI) * 65536) | 0;
  // Sign-extend 16-bit (like C's (short) cast).
  const signed = (packed << 16) >> 16;
  return (signed * M_2PI) / 65536;
}

// Scratch objects to avoid per-frame allocations.
const _forwardVec = new Vector3();
const _sideVec = new Vector3();
const _moveVec = new Vector3();
const _lookEuler = new Euler(0, 0, 0, "YXZ");

/** A buffered move sent to the server, awaiting acknowledgment. */
interface BufferedMove {
  /** Browser-assigned move index. */
  moveIndex: number;
  /** The full move data for re-sending to the server. */
  move: ClientMove;
  /** Rotation deltas for prediction replay. */
  yaw: number;
  pitch: number;
  /** Movement axes for position prediction replay. */
  x: number;
  y: number;
  z: number;
}

/**
 * Apply Camera::processTick position update.
 *
 * Matches Tribes2.exe FUN_005cbc80: builds Rz(yaw)*Rx(pitch) orientation
 * matrix, transforms local move axes to world space, applies at tick rate.
 *
 * Torque uses (cos,+sin;-sin,cos) rotation convention, NOT standard math.
 * The resulting Rz(y)*Rx(p) row-major matrix columns are:
 *   right   (move.x): { cy, -sy,  0  }
 *   forward (move.y): { sy*cp, cy*cp, -sp }
 *   up      (move.z): { sy*sp, cy*sp,  cp }
 *
 * IMPORTANT: `yaw`/`pitch` must be the rotation state from the PREVIOUS
 * tick, not the current one. Tribes2.exe reads the old transform matrix
 * (built at end of previous tick) for position computation.
 */
function applyProcessTickPosition(
  pos: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  mx: number,
  my: number,
  mz: number,
  speed: number,
): void {
  if (mx === 0 && my === 0 && mz === 0) return;

  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);

  // pos += (right*mx + forward*my + up*mz) * speed * TickSec
  const scale = speed * TICK_SEC;
  pos.x += (cy * mx + sy * cp * my + sy * sp * mz) * scale;
  pos.y += (-sy * mx + cy * cp * my + cy * sp * mz) * scale;
  pos.z += (-sp * my + cp * mz) * scale;
}

/**
 * Consumes input frames from the move queue and applies them.
 *
 * Implements the same client-side prediction strategy as the real Tribes 2
 * client (verified against Tribes2.exe):
 *
 * 1. Camera::processTick — apply rotation + position at tick rate.
 * 2. Camera::interpolateTick — interpolate between tick states for smooth
 *    frame-rate rendering.
 * 3. Send ALL unacked moves to the server at tick rate (like moveWritePacket).
 * 4. On server correction (readPacketData), snap to authoritative state and
 *    replay all unacknowledged moves.
 *
 * The browser owns the move index counter and re-sends unacked moves for
 * UDP reliability, just like the real Tribes 2 client.
 */
export function InputConsumer() {
  const { moveQueue, mode, setMode } = useInputContext();
  const adapter = useLiveSelector((s) => s.adapter);
  const gameStatus = useLiveSelector((s) => s.gameStatus);
  const sendMoves = useLiveSelector((s) => s.sendMoves);
  const store = useEngineStoreApi();
  const camera = useThree((state) => state.camera);
  const getTickFraction = useGetTickFraction();
  const activeAdapterRef = useRef<LiveStreamAdapter | null>(null);

  // ── Move buffer (unacked moves) ──
  const moveBuffer = useRef<BufferedMove[]>([]);
  // Browser-owned move index counter.
  const nextMoveIndex = useRef(0);
  // The last lastMoveAck we processed (to detect new server corrections).
  const lastProcessedAck = useRef(0);
  // The last server camera snapshot we reconciled from (identity check).
  const lastReconciledCamera = useRef<StreamCamera | null>(null);

  // ── Local predicted state (Torque coordinates) ──
  // Absolute predicted yaw/pitch in Torque radians.
  const predYaw = useRef(0);
  const predPitch = useRef(0);
  // Predicted position in Torque world coords (x=east, y=north, z=up).
  const predPos = useRef({ x: 0, y: 0, z: 0 });

  // ── Previous tick state for interpolateTick ──
  const prevYaw = useRef(0);
  const prevPitch = useRef(0);
  const prevPos = useRef({ x: 0, y: 0, z: 0 });

  // Whether prediction has been initialized from a server snapshot.
  const predInitialized = useRef(false);

  // ── Orbit target position for follow mode (Torque coordinates) ──
  // Maintained at tick rate from snapshot data, interpolated at frame rate
  // using the same time base as the camera (TickProvider), matching how
  // Tribes2.exe's Camera::interpolateTick reads getRenderWorldBox() using
  // the same dt as all other entities' interpolateTick.
  const prevOrbitTargetPos = useRef({ x: 0, y: 0, z: 0 });
  const currentOrbitTargetPos = useRef({ x: 0, y: 0, z: 0 });
  const orbitTargetInitialized = useRef(false);
  /** Snapshot reference from last orbit target update (identity check). */
  const lastOrbitSnapshot = useRef<unknown>(null);

  // ── Accumulated input for current tick (live mode) ──
  const tickDeltaYaw = useRef(0);
  const tickDeltaPitch = useRef(0);
  const tickMoveX = useRef(0);
  const tickMoveY = useRef(0);
  const tickMoveZ = useRef(0);
  const tickTriggers = useRef([false, false, false, false, false, false]);

  // Previous trigger state for edge detection.
  const prevTriggers = useRef([false, false, false, false, false, false]);

  const isLive =
    !!adapter &&
    (gameStatus === "connected" || gameStatus === "authenticating");

  // Wire adapter to engine store.
  useEffect(() => {
    if (isLive && adapter) {
      if (activeAdapterRef.current === adapter) return;

      log.info("wiring adapter to engine store");
      const liveState = liveConnectionStore.getState();
      const liveRecording: StreamRecording = {
        source: "live",
        duration: Infinity,
        missionName: liveState.mapName ?? null,
        gameType: null,
        serverDisplayName: liveState.serverName ?? null,
        recorderName: liveState.warriorName ?? null,
        recordingDate: null,
        streamingPlayback: adapter,
      };

      store.getState().setRecording(liveRecording);
      store.getState().setPlaybackStatus("playing");
      activeAdapterRef.current = adapter;

      // Reset prediction state for new connection.
      predInitialized.current = false;
      orbitTargetInitialized.current = false;
      lastOrbitSnapshot.current = null;
      moveBuffer.current.length = 0;
      nextMoveIndex.current = 0;
      lastProcessedAck.current = 0;
      lastReconciledCamera.current = null;

      setMode("fly");
    } else if (!isLive && activeAdapterRef.current) {
      const current = store.getState().playback.recording;
      if (current?.source === "live") {
        store.getState().setRecording(null);
      }
      activeAdapterRef.current = null;
      predInitialized.current = false;
      orbitTargetInitialized.current = false;
      lastOrbitSnapshot.current = null;
      moveBuffer.current.length = 0;

      setMode("local");
    }
  }, [isLive, adapter, store, setMode]);

  // ── processTick: send moves at the Torque tick rate (32Hz). ──
  useTick(() => {
    if (!activeAdapterRef.current || gameStatus !== "connected") return;

    // Consume accumulated deltas.
    const yaw = tickDeltaYaw.current;
    const pitch = tickDeltaPitch.current;
    tickDeltaYaw.current = 0;
    tickDeltaPitch.current = 0;

    const mx = tickMoveX.current;
    const my = tickMoveY.current;
    const mz = tickMoveZ.current;
    tickMoveX.current = 0;
    tickMoveY.current = 0;
    tickMoveZ.current = 0;

    const triggers = [...tickTriggers.current];
    tickTriggers.current.fill(false);

    // Trigger edge detection.
    if (triggers[2] && !prevTriggers.current[2]) {
      activeAdapterRef.current.toggleObserverMode();
      log.info("observer mode: %s", activeAdapterRef.current.observerMode);
      setMode(
        activeAdapterRef.current.observerMode === "follow" ? "follow" : "fly",
      );
    }
    prevTriggers.current = triggers;

    // ── Camera::processTick equivalent ──

    // Quantize rotation to match server's Move::clamp/unclamp round-trip.
    // useFrame already applied raw deltas for responsiveness; correct to
    // the quantized value the server will actually use.
    const qYaw = quantizeRotation(yaw);
    const qPitch = quantizeRotation(pitch);
    predYaw.current += qYaw - yaw;
    predPitch.current += qPitch - pitch;

    // Save previous tick state for interpolateTick.
    prevYaw.current = predYaw.current;
    prevPitch.current = predPitch.current;
    prevPos.current = { ...predPos.current };

    // NOTE: Rotation is NOT re-applied here — useFrame already applied
    // (now corrected to quantized). useTick only buffers and sends.

    // Apply position using the PREVIOUS tick's rotation, matching Tribes2.exe:
    // processTick reads the old transform matrix (built at end of previous
    // tick) for position computation, even though mRot is updated first.
    // Since predYaw/predPitch already include this tick's quantized deltas,
    // subtract them to get the old rotation.
    const speed = CAMERA_SPEED * 2;
    const posRotYaw = predYaw.current - qYaw;
    const posRotPitch = predPitch.current - qPitch;
    applyProcessTickPosition(
      predPos.current,
      posRotYaw,
      posRotPitch,
      mx,
      my,
      mz,
      speed,
    );

    // Always set trigger[1] (altTrigger) — the Torque Camera doubles its
    // movement speed when this trigger is active. Our speedMultiplier is
    // a fraction of this faster base speed, already applied by the input
    // producer (MouseAndKeyboardHandler) to the movement axes.
    triggers[1] = true;

    // Build the move and assign a browser-owned index.
    const moveIndex = nextMoveIndex.current++;
    const move: ClientMove = {
      x: mx,
      y: my,
      z: mz,
      yaw,
      pitch,
      roll: 0,
      trigger: triggers,
      freeLook: false,
    };

    // Buffer for prediction replay and re-sending.
    const buffer = moveBuffer.current;
    buffer.push({
      moveIndex,
      move,
      yaw: qYaw,
      pitch: qPitch,
      x: mx,
      y: my,
      z: mz,
    });

    // Cap buffer size.
    if (buffer.length > MAX_MOVE_BUFFER) {
      buffer.splice(0, buffer.length - MAX_MOVE_BUFFER);
    }

    // Prune acknowledged moves before sending.
    const ack = activeAdapterRef.current.lastMoveAck;
    while (buffer.length > 0 && buffer[0].moveIndex < ack) {
      buffer.shift();
    }

    // Send ALL unacked moves, just like Tribes 2's moveWritePacket.
    // The server deduplicates based on moveStartIndex.
    if (buffer.length > 0) {
      const movesToSend = buffer.slice(0, MAX_MOVES_PER_PACKET);
      sendMoves(
        movesToSend.map((m) => m.move),
        movesToSend[0].moveIndex,
      );
    }

    // ── Orbit target position tracking (follow mode) ──
    // Read the orbit target's position from the snapshot at tick rate,
    // matching Camera::processTick which reads getWorldBox().getCenter().
    // Only update when the snapshot has actually changed (new packet data),
    // otherwise prev gets overwritten with current on every useTick, destroying
    // the interpolation endpoints between packets.
    const snap = activeAdapterRef.current.getSnapshot();
    if (snap !== lastOrbitSnapshot.current) {
      lastOrbitSnapshot.current = snap;
      const cam = snap?.camera;
      if (cam?.orbitTargetId) {
        const targetEntity = snap.entities.find(
          (e) => e.id === cam.orbitTargetId,
        );
        if (targetEntity?.position) {
          prevOrbitTargetPos.current = { ...currentOrbitTargetPos.current };
          currentOrbitTargetPos.current = {
            x: targetEntity.position[0],
            y: targetEntity.position[1],
            z: targetEntity.position[2],
          };
          if (!orbitTargetInitialized.current) {
            prevOrbitTargetPos.current = { ...currentOrbitTargetPos.current };
            orbitTargetInitialized.current = true;
          }
        }
      }
    }
  });

  // ── useFrame: drain moveQueue, reconcile, interpolateTick + render. ──
  useFrame((state, delta) => {
    const frames = moveQueue.current;
    if (frames.length > 0) {
      // Drain the move queue.
      let dYaw = 0;
      let dPitch = 0;
      let x = 0;
      let y = 0;
      let z = 0;
      let frameDelta = 0;
      const frameTriggers = [false, false, false, false, false, false];

      for (const frame of frames) {
        dYaw += frame.deltaYaw;
        dPitch += frame.deltaPitch;
        x = frame.x; // latest wins
        y = frame.y;
        z = frame.z;
        frameDelta += frame.delta;
        for (let i = 0; i < frame.triggers.length; i++) {
          if (frame.triggers[i]) frameTriggers[i] = true;
        }
      }
      moveQueue.current.length = 0;

      if (isLive && activeAdapterRef.current && gameStatus === "connected") {
        // Live mode: accumulate for useTick to consume and send.
        tickDeltaYaw.current += dYaw;
        tickDeltaPitch.current += dPitch;
        tickMoveX.current = x;
        tickMoveY.current = y;
        tickMoveZ.current = z;
        for (let i = 0; i < frameTriggers.length; i++) {
          if (frameTriggers[i]) tickTriggers.current[i] = true;
        }

        // Apply look deltas to prediction immediately for frame-rate
        // responsiveness (the pending deltas haven't been consumed by useTick
        // yet, but we still want them to affect the camera this frame).
        predYaw.current += dYaw;
        predPitch.current = Math.max(
          -MAX_PITCH,
          Math.min(MAX_PITCH, predPitch.current + dPitch),
        );
      } else {
        // Local mode: apply input directly to camera.
        const spState = streamPlaybackStore.getState();
        if (spState.playback && !spState.freeFlyCamera) return;

        applyLocalCamera(camera, dYaw, dPitch, x, y, z, frameDelta);
        return;
      }
    }

    // ── Live mode: server reconciliation + interpolateTick ──

    if (!isLive || !activeAdapterRef.current || gameStatus !== "connected") {
      return;
    }

    const adapterRef = activeAdapterRef.current;
    const snapshot = adapterRef.getSnapshot();
    const serverCam = snapshot?.camera;

    // Check for new server correction.
    if (
      serverCam &&
      serverCam !== lastReconciledCamera.current &&
      typeof serverCam.yaw === "number" &&
      typeof serverCam.pitch === "number"
    ) {
      lastReconciledCamera.current = serverCam;

      // Prune acknowledged moves from the buffer.
      const ack = adapterRef.lastMoveAck;
      if (ack > lastProcessedAck.current) {
        lastProcessedAck.current = ack;
        const buffer = moveBuffer.current;
        while (buffer.length > 0 && buffer[0].moveIndex < ack) {
          buffer.shift();
        }
      }

      // Snap to server's authoritative state (rotation + position).
      predYaw.current = serverCam.yaw;
      predPitch.current = serverCam.pitch;
      predPos.current = {
        x: serverCam.position[0],
        y: serverCam.position[1],
        z: serverCam.position[2],
      };

      // Replay all unacknowledged moves on top of server state.
      // This is exactly what ProcessList::advanceClientTime does:
      // for each pending move, call control->processTick(&move).
      // Position uses the rotation from BEFORE each move (old transform),
      // then rotation is updated for the next move.
      const speed = CAMERA_SPEED * 2;
      for (const move of moveBuffer.current) {
        // Position first, using pre-move rotation (matches Tribes2.exe).
        applyProcessTickPosition(
          predPos.current,
          predYaw.current,
          predPitch.current,
          move.x,
          move.y,
          move.z,
          speed,
        );
        // Then update rotation for the next move.
        predYaw.current += move.yaw;
        predPitch.current = Math.max(
          -MAX_PITCH,
          Math.min(MAX_PITCH, predPitch.current + move.pitch),
        );
      }

      // Also add any pending deltas not yet consumed by useTick.
      predYaw.current += tickDeltaYaw.current;
      predPitch.current = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, predPitch.current + tickDeltaPitch.current),
      );

      // After reconciliation, snap prev state to match (no interpolation
      // glitch — we want the corrected state to appear immediately).
      prevYaw.current = predYaw.current;
      prevPitch.current = predPitch.current;
      prevPos.current = { ...predPos.current };

      predInitialized.current = true;

      // Initialize orbit target position on first reconciliation with
      // orbit data, so follow mode works immediately after mode switch.
      if (serverCam.orbitTargetId && !orbitTargetInitialized.current) {
        const targetEntity = snapshot.entities.find(
          (e) => e.id === serverCam.orbitTargetId,
        );
        if (targetEntity?.position) {
          const pos = {
            x: targetEntity.position[0],
            y: targetEntity.position[1],
            z: targetEntity.position[2],
          };
          currentOrbitTargetPos.current = pos;
          prevOrbitTargetPos.current = { ...pos };
          orbitTargetInitialized.current = true;
        }
      }
    }

    if (!predInitialized.current) return;

    if (mode === "fly") {
      applyFlyCamera(
        state.camera,
        prevPos.current,
        predPos.current,
        predYaw.current,
        predPitch.current,
        getTickFraction(),
      );
    } else if (mode === "follow") {
      if (!orbitTargetInitialized.current) return;
      applyOrbitCamera(
        state.camera,
        prevOrbitTargetPos.current,
        currentOrbitTargetPos.current,
        predYaw.current,
        predPitch.current,
        getTickFraction(),
        serverCam?.orbitDistance ?? 4,
        serverCam?.orbitTargetId,
      );
    }
  });

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      if (activeAdapterRef.current) {
        const current = store.getState().playback.recording;
        if (current?.source === "live") {
          store.getState().setRecording(null);
        }
        activeAdapterRef.current = null;
      }
    };
  }, [store]);

  return null;
}

/** Apply rotation and movement to the camera locally (local/demo mode). */
function applyLocalCamera(
  camera: Camera,
  dYaw: number,
  dPitch: number,
  x: number,
  y: number,
  z: number,
  delta: number,
) {
  if (dYaw !== 0 || dPitch !== 0) {
    _lookEuler.setFromQuaternion(camera.quaternion, "YXZ");
    _lookEuler.y -= dYaw;
    _lookEuler.x -= dPitch;
    _lookEuler.x = Math.max(
      -LOCAL_MAX_PITCH,
      Math.min(LOCAL_MAX_PITCH, _lookEuler.x),
    );
    camera.quaternion.setFromEuler(_lookEuler);
  }

  if (x !== 0 || y !== 0 || z !== 0) {
    camera.getWorldDirection(_forwardVec);
    _forwardVec.normalize();
    _sideVec.crossVectors(camera.up, _forwardVec).normalize();

    _moveVec.set(0, 0, 0);
    if (y !== 0) _moveVec.addScaledVector(_forwardVec, y);
    if (x !== 0) _moveVec.addScaledVector(_sideVec, -x);
    if (z !== 0) _moveVec.y += z;

    const len = _moveVec.length();
    if (len > 0) {
      // Clamp length to 1 so diagonal movement isn't faster, but preserve
      // sub-1 magnitudes from speedMultiplier.
      _moveVec.multiplyScalar((Math.min(1, len) / len) * MAX_SPEED * delta);
      camera.position.add(_moveVec);
    }
  }
}

interface TorquePos {
  x: number;
  y: number;
  z: number;
}

/**
 * Camera::interpolateTick for fly mode.
 * Interpolates predicted position between tick states, sets rotation from
 * frame-rate predicted values.
 */
function applyFlyCamera(
  camera: Camera,
  prevPos: TorquePos,
  predPos: TorquePos,
  predYaw: number,
  predPitch: number,
  tickFrac: number,
) {
  // Torque interpolates: renderState = prev + (current - prev) * tickFrac
  const renderX = prevPos.x + (predPos.x - prevPos.x) * tickFrac;
  const renderY = prevPos.y + (predPos.y - prevPos.y) * tickFrac;
  const renderZ = prevPos.z + (predPos.z - prevPos.z) * tickFrac;

  // Convert Torque coords (x=east, y=north, z=up) to Three.js (x=north, y=up, z=east).
  camera.position.set(renderY, renderZ, renderX);

  const [qx, qy, qz, qw] = yawPitchToQuaternion(predYaw, predPitch);
  camera.quaternion.set(qx, qy, qz, qw);
}

/**
 * Camera::interpolateTick for orbit mode.
 * Interpolates the orbit target's position between tick states using the
 * camera's own tick fraction (matching Tribes2.exe where Camera and its
 * orbit target use the same dt from ProcessList). Computes orbit pullback
 * from frame-rate predicted rotation for responsive mouse control.
 */
function applyOrbitCamera(
  camera: Camera,
  prevTargetPos: TorquePos,
  currentTargetPos: TorquePos,
  predYaw: number,
  predPitch: number,
  tickFrac: number,
  orbitDistance: number,
  orbitTargetId: string | undefined,
) {
  // Interpolate orbit target position between tick states (Torque coords).
  const tx =
    prevTargetPos.x + (currentTargetPos.x - prevTargetPos.x) * tickFrac;
  const ty =
    prevTargetPos.y + (currentTargetPos.y - prevTargetPos.y) * tickFrac;
  const tz =
    prevTargetPos.z + (currentTargetPos.z - prevTargetPos.z) * tickFrac;

  // Height offset: approximate getWorldBox().getCenter() for players.
  const isPlayer =
    orbitTargetId != null &&
    streamPlaybackStore.getState().entities.get(orbitTargetId)?.renderType ===
      "Player";
  const centerZ = tz + (isPlayer ? 1.0 : 0);

  // Compute orbit pullback using frame-rate predicted rotation.
  const sp = Math.sin(predPitch);
  const cp = Math.cos(predPitch);
  const sy = Math.sin(predYaw);
  const cy = Math.cos(predYaw);

  // Torque forward (column 1 of Rz*Rx, Torque convention):
  //   {sy*cp, cy*cp, -sp}
  // Camera pulls back along negative forward:
  //   {-sy*cp, -cy*cp, sp}
  const dist = Math.max(0.1, orbitDistance);
  const camX = tx - sy * cp * dist;
  const camY = ty - cy * cp * dist;
  const camZ = centerZ + sp * dist;

  // Convert Torque coords to Three.js (x=north, y=up, z=east).
  camera.position.set(camY, camZ, camX);

  const [qx, qy, qz, qw] = yawPitchToQuaternion(predYaw, predPitch);
  camera.quaternion.set(qx, qy, qz, qw);
}
