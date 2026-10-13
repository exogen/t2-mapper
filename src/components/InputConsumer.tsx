import { useRef, useEffect, useEffectEvent } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Camera, Euler, Vector3 } from "three";
import { createLogger } from "../logger";
import {
  liveConnectionStore,
  useLiveSelector,
} from "../state/liveConnectionStore";
import { useEngineStoreApi } from "../state/engineStore";
import {
  streamPlaybackStore,
  type DemoCameraMode,
} from "../state/streamPlaybackStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { cameraRegistry } from "../state/cameraRegistry";
import { useInputContext } from "./InputContext";
import { useTick, useGetTickFraction } from "./TickProvider";
import {
  orbitPullbackDir,
  yawPitchToQuaternion,
  MAX_PITCH,
} from "../stream/streamHelpers";
import type { StreamRecording } from "../stream/types";
import type { LiveStreamAdapter } from "../stream/liveStreaming";
import {
  claimMoveIndex,
  pruneAcknowledgedMoves,
  type PendingMove,
} from "../stream/liveMoveBuffer";
import type { ClientMove } from "../../relay/types";
import { FramePriority } from "./framePriority";
import { useSettings } from "./SettingsProvider";
import { isPlayerOrbitLocked } from "../state/cameraOwner";

const log = createLogger("InputConsumer");

const MAX_SPEED = 200;
const LOCAL_MAX_PITCH = Math.PI / 2 - 0.01; // ~89°

/**
 * Camera::processTick (Tribes2.exe FUN_005cbc80) clamps pitch to ±80°
 * (0x0079acf0) in every mode — tighter than a Player's MAX_PITCH.
 */
const CAMERA_MAX_PITCH = 1.3962;

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

/**
 * Quantize a movement axis through the Move's 6-bit packing (0-32,
 * centered at 16): the value the server's Camera actually applies.
 */
function quantizeAxis(value: number): number {
  return Math.max(0, Math.min(32, Math.round(value * 16 + 16))) / 16 - 1;
}

function clampCameraPitch(pitch: number): number {
  return Math.max(-CAMERA_MAX_PITCH, Math.min(CAMERA_MAX_PITCH, pitch));
}

// Scratch objects to avoid per-frame allocations.
const _forwardVec = new Vector3();
const _sideVec = new Vector3();
const _moveVec = new Vector3();
const _orbitDir = new Vector3();
const _lookEuler = new Euler(0, 0, 0, "YXZ");

/**
 * A move sent to the server, kept for prediction replay until acked.
 */
interface BufferedMove extends PendingMove {
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
 * 3. Collect one move per tick, pausing while the server is 30 moves
 *    behind (isBacklogged), and hand each new move to the relay, whose
 *    move list resends it until acked (moveWritePacket).
 * 4. On server correction (readPacketData), snap to authoritative state and
 *    replay all unacknowledged moves.
 *
 * The browser owns the move index counter, which runs for the whole
 * connection: the server's lastMoveAck survives mission changes.
 */
export function InputConsumer() {
  const { followBehindPlayer } = useSettings();
  const { moveQueue, clearInput, mode, setMode } = useInputContext();
  const adapter = useLiveSelector((s) => s.adapter);
  const gameStatus = useLiveSelector((s) => s.gameStatus);
  const liveReady = useLiveSelector((s) => s.liveReady);
  const sendMoves = useLiveSelector((s) => s.sendMoves);
  const store = useEngineStoreApi();
  const camera = useThree((state) => state.camera);
  const getTickFraction = useGetTickFraction();
  const activeAdapterRef = useRef<LiveStreamAdapter | null>(null);

  // ── Move buffer (unacked moves) ──
  const moveBuffer = useRef<BufferedMove[]>([]);
  // Browser-owned move index counter.
  const nextMoveIndex = useRef(0);
  // Simulation snapshots also change each tick; only packets are corrections.
  const lastReconciledUpdate = useRef(-1);

  // ── Local predicted state (Torque coordinates) ──
  // Absolute predicted yaw/pitch in Torque radians.
  const predYaw = useRef(0);
  const predPitch = useRef(0);
  // Predicted position in Torque world coords (x=east, y=north, z=up).
  const predPos = useRef({ x: 0, y: 0, z: 0 });

  // ── Previous tick position for interpolateTick ──
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

  // ── Input for the next move (live mode): look deltas and triggers
  // accumulate until a tick consumes them; the axes hold the current input.
  const tickDeltaYaw = useRef(0);
  const tickDeltaPitch = useRef(0);
  const tickMoveX = useRef(0);
  const tickMoveY = useRef(0);
  const tickMoveZ = useRef(0);
  const tickTriggers = useRef([false, false, false, false, false, false]);
  // Pending input belongs to the connection and mission it was collected
  // in, and a backlog can hold a whole stall's worth (triggers included).
  const resetTickInput = useEffectEvent(() => {
    tickDeltaYaw.current = 0;
    tickDeltaPitch.current = 0;
    tickMoveX.current = 0;
    tickMoveY.current = 0;
    tickMoveZ.current = 0;
    tickTriggers.current.fill(false);
  });

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
      lastReconciledUpdate.current = -1;
      resetTickInput();

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
      resetTickInput();

      setMode("local");
    }
  }, [isLive, adapter, store, setMode]);

  // Reset prediction state and mode when liveReady goes false (map cycle).
  // During map transitions, liveReady is false from MissionStartPhase1 until
  // the first ghost arrives on the new map. Reset to "fly" here; the server-
  // authoritative mode derivation in useFrame will correct it once the first
  // camera snapshot arrives on the new map.
  useEffect(() => {
    if (!liveReady && activeAdapterRef.current) {
      log.info("mission change: resetting prediction state and mode");
      predInitialized.current = false;
      orbitTargetInitialized.current = false;
      lastOrbitSnapshot.current = null;
      // Keep nextMoveIndex: the server's lastMoveAck persists across
      // missions and drops any index below it as already received.
      moveBuffer.current.length = 0;
      lastReconciledUpdate.current = -1;
      resetTickInput();
      setMode("fly");
    }
  }, [liveReady, setMode]);

  // Set input mode to "follow" during orbit/first-person override so
  // MouseAndKeyboardHandler flips drag direction correctly. Applied once
  // at mount too — a remount mid-follow must not stay in "local".
  useEffect(() => {
    if (isLive) return;
    const modeFor = (cameraMode: DemoCameraMode) =>
      cameraMode === "orbitOverride" || cameraMode === "firstPersonOverride"
        ? ("follow" as const)
        : ("local" as const);
    let prevCameraMode = streamPlaybackStore.getState().cameraMode;
    setMode(modeFor(prevCameraMode));
    return streamPlaybackStore.subscribe((state) => {
      if (state.cameraMode === prevCameraMode) return;
      prevCameraMode = state.cameraMode;
      setMode(modeFor(state.cameraMode));
    });
  }, [isLive, setMode]);

  // ── processTick: collect/send one move every 32 ms. ──
  useTick(() => {
    const liveAdapter = activeAdapterRef.current;
    if (!liveAdapter || gameStatus !== "connected" || !liveReady) return;

    // ── Orbit target position tracking (follow mode) ──
    // Read the orbit target's position from the snapshot at tick rate,
    // matching Camera::processTick which reads getWorldBox().getCenter().
    // Only update when the simulation snapshot has actually changed,
    // otherwise prev gets overwritten with current on every useTick, destroying
    // the interpolation endpoints between packets.
    const snap = liveAdapter.getSnapshot();
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

    const buffer = moveBuffer.current;
    const moveIndex = claimMoveIndex(
      buffer,
      liveAdapter.lastMoveAck,
      nextMoveIndex.current,
    );
    if (moveIndex === null) {
      // Backlogged: no tick. Look deltas and triggers carry into the next
      // move, like getNextMove's accumulators, and the pose holds still.
      prevPos.current = { ...predPos.current };
      return;
    }
    nextMoveIndex.current = moveIndex + 1;

    // Consume accumulated deltas.
    const yaw = tickDeltaYaw.current;
    const pitch = tickDeltaPitch.current;
    tickDeltaYaw.current = 0;
    tickDeltaPitch.current = 0;

    // The axes are the input held this frame (sampled just before the
    // ticks), like the key state getNextMove reads, so every tick of a slow
    // frame sees the same current input. The server applies them packed,
    // so predict with the packed values too.
    const mx = quantizeAxis(tickMoveX.current);
    const my = quantizeAxis(tickMoveY.current);
    const mz = quantizeAxis(tickMoveZ.current);

    const triggers = [...tickTriggers.current];
    tickTriggers.current.fill(false);

    // ── Camera::processTick equivalent ──

    // Quantize rotation to match server's Move::clamp/unclamp round-trip.
    // useFrame already applied raw deltas for responsiveness; correct to
    // the quantized value the server will actually use.
    const qYaw = quantizeRotation(yaw);
    const qPitch = quantizeRotation(pitch);
    predYaw.current += qYaw - yaw;
    predPitch.current += qPitch - pitch;

    // Save previous tick position for interpolateTick.
    prevPos.current = { ...predPos.current };

    // NOTE: Rotation is NOT re-applied here — the input drain already
    // applied it (now corrected to quantized).

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

    // The move as the server will decode it.
    const move: ClientMove = {
      x: mx,
      y: my,
      z: mz,
      yaw: qYaw,
      pitch: qPitch,
      roll: 0,
      trigger: triggers,
      freeLook: false,
    };

    liveAdapter.submitMove(move, moveIndex);

    // Buffer for prediction replay until the server acknowledges it.
    buffer.push({
      moveIndex,
      yaw: qYaw,
      pitch: qPitch,
      x: mx,
      y: my,
      z: mz,
    });

    // Each move goes to the relay once; its move list resends it in every
    // packet until acked (moveWritePacket, without the four-send limit).
    sendMoves([move], moveIndex);
  });

  // ── Drain this frame's input: after the producers, before the ticks. ──
  useFrame(() => {
    const frames = moveQueue.current;
    const liveInput =
      isLive &&
      !!activeAdapterRef.current &&
      gameStatus === "connected" &&
      liveReady;
    if (frames.length === 0) {
      // Producers emit a frame every frame while any input is held, so an
      // empty queue means the movement keys are up.
      if (liveInput) {
        tickMoveX.current = 0;
        tickMoveY.current = 0;
        tickMoveZ.current = 0;
      }
      return;
    }

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
      // Use the value with the largest magnitude across all producers.
      // This prevents a keyboard-only frame (x=0) from overwriting
      // joystick movement from another producer in the same frame.
      if (Math.abs(frame.x) > Math.abs(x)) x = frame.x;
      if (Math.abs(frame.y) > Math.abs(y)) y = frame.y;
      if (Math.abs(frame.z) > Math.abs(z)) z = frame.z;
      frameDelta += frame.delta;
      for (let i = 0; i < frame.triggers.length; i++) {
        if (frame.triggers[i]) frameTriggers[i] = true;
      }
    }
    clearInput();

    if (liveInput) {
      // Live mode: stage for the ticks — look deltas and triggers
      // accumulate; the axes hold this frame's input.
      tickDeltaYaw.current += dYaw;
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
      // Send the pitch change the clamp allowed, i.e. what the user saw:
      // pitch held past the limit through a backlog must not reach the
      // server, nor overflow the Move's 16-bit field.
      const pitchBefore = predPitch.current;
      predPitch.current = clampCameraPitch(pitchBefore + dPitch);
      tickDeltaPitch.current += predPitch.current - pitchBefore;
    } else {
      // Local mode: apply input directly to camera.
      const spState = streamPlaybackStore.getState();
      if (spState.playback) {
        if (spState.cameraMode === "freeFly") {
          applyLocalCamera(camera, dYaw, dPitch, x, y, z, frameDelta);
        } else if (
          spState.cameraMode === "orbitOverride" &&
          !isPlayerOrbitLocked(followBehindPlayer)
        ) {
          // Accumulate orbit yaw/pitch for StreamingController to read.
          streamPlaybackStore.setState({
            orbitOverrideYaw: spState.orbitOverrideYaw + dYaw,
            orbitOverridePitch: Math.max(
              -MAX_PITCH,
              Math.min(MAX_PITCH, spState.orbitOverridePitch + dPitch),
            ),
          });
        }
        return;
      }

      applyLocalCamera(camera, dYaw, dPitch, x, y, z, frameDelta);
    }
  }, FramePriority.CameraInput);

  // ── Live prediction's pose, after this frame's ticks: server
  // reconciliation + interpolateTick. ──
  useFrame((state) => {
    if (
      !isLive ||
      !activeAdapterRef.current ||
      gameStatus !== "connected" ||
      !liveReady
    ) {
      return;
    }

    const adapterRef = activeAdapterRef.current;
    const snapshot = adapterRef.getSnapshot();
    const serverCam = snapshot?.camera;

    // Check for new server correction.
    if (
      serverCam &&
      adapterRef.serverUpdateId !== lastReconciledUpdate.current &&
      typeof serverCam.yaw === "number" &&
      typeof serverCam.pitch === "number"
    ) {
      lastReconciledUpdate.current = adapterRef.serverUpdateId;

      pruneAcknowledgedMoves(moveBuffer.current, adapterRef.lastMoveAck);

      // Snap to server's authoritative state (rotation + position).
      predYaw.current = serverCam.yaw;
      predPitch.current = serverCam.pitch;
      predPos.current = {
        x: serverCam.position[0],
        y: serverCam.position[1],
        z: serverCam.position[2],
      };
      // Camera::readPacketData zeroes the deltas: with no move to replay,
      // the pose holds still.
      prevPos.current = { ...predPos.current };

      // Replay all unacknowledged moves on top of server state.
      // This is exactly what ProcessList::advanceClientTime does:
      // for each pending move, call control->processTick(&move).
      // Position uses the rotation from BEFORE each move (old transform),
      // then rotation is updated for the next move.
      const speed = CAMERA_SPEED * 2;
      for (const move of moveBuffer.current) {
        // processTick records each move's step as the delta interpolateTick
        // renders, so the frame keeps interpolating across the last replayed
        // move — a packet that agrees with the prediction changes nothing.
        prevPos.current = { ...predPos.current };
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
        predPitch.current = clampCameraPitch(predPitch.current + move.pitch);
      }

      // Also add any pending deltas not yet consumed by useTick.
      predYaw.current += tickDeltaYaw.current;
      predPitch.current = clampCameraPitch(
        predPitch.current + tickDeltaPitch.current,
      );

      predInitialized.current = true;

      // Derive observer mode from the server's camera data — the server
      // is authoritative. "third-person" with a camera control type means
      // the server's Camera is in OrbitObject mode (follow). "observer"
      // means free-fly. This corrects local state if a trigger 2 move
      // was lost or the server rejected the mode transition.
      const serverMode = serverCam.mode === "third-person" ? "follow" : "fly";
      if (serverMode !== mode) {
        log.info("server corrected observer mode: %s → %s", mode, serverMode);
        setMode(serverMode);
        if (activeAdapterRef.current) {
          activeAdapterRef.current.observerMode = serverMode;
        }
        // Reset orbit tracking when leaving follow mode so it re-initializes
        // cleanly next time we enter follow.
        if (serverMode === "fly") {
          orbitTargetInitialized.current = false;
          lastOrbitSnapshot.current = null;
        }
      }

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

    // The observer pose belongs on the PERSPECTIVE camera. While command
    // circuit mode is active the default camera is the CC ortho — writing
    // the pose there stomps the camera the CC markers project through
    // (the rig re-fixes it before render, masking the corruption from
    // everything except the screen-space indicators).
    const liveCamera = cameraRegistry.perspective ?? state.camera;

    if (mode === "fly") {
      applyFlyCamera(
        liveCamera,
        prevPos.current,
        predPos.current,
        predYaw.current,
        predPitch.current,
        getTickFraction(),
      );
    } else if (mode === "follow") {
      if (!orbitTargetInitialized.current) return;
      applyOrbitCamera(
        liveCamera,
        prevOrbitTargetPos.current,
        currentOrbitTargetPos.current,
        predYaw.current,
        predPitch.current,
        getTickFraction(),
        serverCam?.orbitDistance ?? 4,
        serverCam?.orbitTargetId,
      );
    }
  }, FramePriority.CameraLive);

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
    gameEntityStore.getState().streamEntities.get(orbitTargetId)?.renderType ===
      "Player";
  const centerZ = tz + (isPlayer ? 1.0 : 0);

  // Pull back along the (Three.js space) orbit direction for the
  // frame-rate predicted rotation.
  const dist = Math.max(0.1, orbitDistance);
  orbitPullbackDir(predYaw, predPitch, _orbitDir);

  // Torque coords (x=east, y=north, z=up) → Three.js (x=north, y=up, z=east).
  camera.position.set(
    ty + _orbitDir.x * dist,
    centerZ + _orbitDir.y * dist,
    tx + _orbitDir.z * dist,
  );

  const [qx, qy, qz, qw] = yawPitchToQuaternion(predYaw, predPitch);
  camera.quaternion.set(qx, qy, qz, qw);
}
