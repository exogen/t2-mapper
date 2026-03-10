import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useKeyboardControls } from "@react-three/drei";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useEngineStoreApi } from "../state/engineStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { Controls, MOUSE_SENSITIVITY, ARROW_LOOK_SPEED } from "./ObserverControls";
import { useControls } from "./SettingsProvider";
import { useTick, TICK_RATE } from "./TickProvider";
import {
  yawPitchToQuaternion,
  MAX_PITCH,
} from "../stream/streamHelpers";
import type { StreamRecording, StreamCamera } from "../stream/types";
import type { LiveStreamAdapter } from "../stream/liveStreaming";

const TICK_INTERVAL = 1 / TICK_RATE;

// Scratch objects to avoid per-frame allocations.
const _orbitDir = new Vector3();
const _orbitTarget = new Vector3();

/** Predicted camera rotation state for client-side prediction. */
interface PredictionState {
  /** Absolute predicted yaw (Torque radians). */
  yaw: number;
  /** Absolute predicted pitch (Torque radians). */
  pitch: number;
  /** Previous tick's yaw, for inter-tick interpolation. */
  prevYaw: number;
  /** Previous tick's pitch, for inter-tick interpolation. */
  prevPitch: number;
  /** Whether prediction has been initialized from a server snapshot. */
  initialized: boolean;
  /** Last server camera snapshot we synced from (identity check for new data). */
  lastSyncedCamera: StreamCamera | null;
}

/**
 * Bridges the LiveStreamAdapter into the playback pipeline.
 * Sends Move structs to the relay and applies client-side rotation prediction
 * so camera look feels responsive at frame rate, matching how the real
 * Tribes 2 client works (predict locally, correct from server).
 */
export function LiveObserver() {
  const adapter = useLiveSelector((s) => s.adapter);
  const gameStatus = useLiveSelector((s) => s.gameStatus);
  const sendMove = useLiveSelector((s) => s.sendMove);
  const store = useEngineStoreApi();
  const { speedMultiplier } = useControls();
  const activeAdapterRef = useRef<LiveStreamAdapter | null>(null);
  const { gl } = useThree();
  const [, getKeys] = useKeyboardControls<Controls>();

  // Accumulated rotation deltas since last move was sent. Mouse events and
  // arrow keys both add to these; consumed at the tick rate (32ms).
  const deltaYawRef = useRef(0);
  const deltaPitchRef = useRef(0);

  // Client-side prediction state.
  const predRef = useRef<PredictionState>({
    yaw: 0,
    pitch: 0,
    prevYaw: 0,
    prevPitch: 0,
    initialized: false,
    lastSyncedCamera: null,
  });

  // Sub-tick accumulator for interpolation (0..TICK_INTERVAL).
  const tickAccRef = useRef(0);

  // Wire adapter to engine store.
  useEffect(() => {
    if (adapter && (gameStatus === "connected" || gameStatus === "authenticating")) {
      if (activeAdapterRef.current === adapter) return;

      console.log("[LiveObserver] wiring adapter to engine store");
      const liveRecording: StreamRecording = {
        source: "live",
        duration: Infinity,
        missionName: null,
        gameType: null,
        streamingPlayback: adapter,
      };

      store.getState().setRecording(liveRecording);
      store.getState().setPlaybackStatus("playing");
      activeAdapterRef.current = adapter;
      // Reset prediction when connecting to a new server.
      predRef.current.initialized = false;
      predRef.current.lastSyncedCamera = null;
    } else if (!adapter && activeAdapterRef.current) {
      store.getState().setRecording(null);
      activeAdapterRef.current = null;
      predRef.current.initialized = false;
    }
  }, [adapter, gameStatus, store]);

  // Accumulate mouse deltas when pointer is locked or dragging.
  useEffect(() => {
    let dragging = false;

    const handleMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement) {
        // Match Three.js PointerLockControls default (0.002).
        deltaYawRef.current += e.movementX * 0.002;
        deltaPitchRef.current += e.movementY * 0.002;
      } else if (dragging) {
        deltaYawRef.current += e.movementX * MOUSE_SENSITIVITY;
        deltaPitchRef.current += e.movementY * MOUSE_SENSITIVITY;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!document.pointerLockElement && e.target === gl.domElement) {
        dragging = true;
      }
    };

    const handleMouseUp = () => {
      dragging = false;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [gl.domElement]);

  // Left-click when pointer-locked in follow mode: cycle to next player.
  // Only intercepts in follow mode — in fly mode, clicks pass through to
  // ObserverControls for pointer lock acquisition.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!document.pointerLockElement || !activeAdapterRef.current) return;
      if (activeAdapterRef.current.observerMode !== "follow") return;
      e.stopImmediatePropagation();
      activeAdapterRef.current.cycleObserveNext();
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, [gl.domElement]);

  // 'O' toggles between follow and free-fly observer modes on the server.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyO" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (!activeAdapterRef.current) return;

      activeAdapterRef.current.toggleObserverMode();
      console.log(`[LiveObserver] observer mode: ${activeAdapterRef.current.observerMode}`);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Accumulate arrow-key rotation each render frame (frame-rate independent).
  useFrame((_, delta) => {
    if (!activeAdapterRef.current || gameStatus !== "connected") return;
    const { lookUp, lookDown, lookLeft, lookRight } = getKeys();
    if (lookRight) deltaYawRef.current += ARROW_LOOK_SPEED * delta;
    if (lookLeft) deltaYawRef.current -= ARROW_LOOK_SPEED * delta;
    if (lookDown) deltaPitchRef.current += ARROW_LOOK_SPEED * delta;
    if (lookUp) deltaPitchRef.current -= ARROW_LOOK_SPEED * delta;
  });

  // Send moves at the Torque tick rate (32Hz) and apply rotation prediction.
  useTick(() => {
    if (!activeAdapterRef.current || gameStatus !== "connected") return;

    const { forward, backward, left, right, up, down } = getKeys();

    // Torque Camera axes: x = strafe (+ right), y = forward/back, z = up/down.
    let mx = 0;
    let my = 0;
    let mz = 0;
    if (forward) my += 1;
    if (backward) my -= 1;
    if (left) mx -= 1;
    if (right) mx += 1;
    if (up) mz += 1;
    if (down) mz -= 1;

    // Consume accumulated rotation deltas.
    const yaw = deltaYawRef.current;
    const pitch = deltaPitchRef.current;
    deltaYawRef.current = 0;
    deltaPitchRef.current = 0;

    // Apply prediction: save previous tick state, then advance.
    const pred = predRef.current;
    pred.prevYaw = pred.yaw;
    pred.prevPitch = pred.pitch;
    pred.yaw += yaw;
    pred.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pred.pitch + pitch));
    // Reset sub-tick accumulator for interpolation.
    tickAccRef.current = 0;

    // Always set trigger[1] (altTrigger) to enable the server's 2× speed mode
    // (80 u/s max). We use altTrigger instead of trigger[0] (fire) because the
    // Observer::onTrigger script interprets fire as "join team" / "cycle player"
    // depending on camera mode, but altTrigger is unhandled in all observer modes.
    // The C++ Camera::processTick checks `trigger[0] || trigger[1]` for fast mode.
    const speed = Math.min(1, speedMultiplier);
    sendMove({
      x: mx * speed,
      y: my * speed,
      z: mz * speed,
      yaw,
      pitch,
      roll: 0,
      trigger: [false, true, false, false, false, false],
      freeLook: false,
    });
  });

  // Override camera rotation with predicted values at frame rate.
  // Priority 1 ensures this runs AFTER StreamingController (priority 0),
  // which handles position from server snapshots.
  useFrame((state, delta) => {
    if (!activeAdapterRef.current || gameStatus !== "connected") return;

    const pred = predRef.current;

    // Sync prediction base from each new server snapshot. The server's
    // yaw/pitch is authoritative; we layer any pending (unconsumed) mouse
    // deltas on top so the camera feels responsive between server updates.
    const snapshot = activeAdapterRef.current.getSnapshot();
    const serverCam = snapshot?.camera;
    if (
      serverCam &&
      serverCam !== pred.lastSyncedCamera &&
      typeof serverCam.yaw === "number" &&
      typeof serverCam.pitch === "number"
    ) {
      // Pending deltas not yet consumed by useTick — replay on top of server.
      const pendingYaw = deltaYawRef.current;
      const pendingPitch = deltaPitchRef.current;

      pred.prevYaw = pred.initialized ? pred.yaw : serverCam.yaw;
      pred.prevPitch = pred.initialized ? pred.pitch : serverCam.pitch;
      pred.yaw = serverCam.yaw + pendingYaw;
      pred.pitch = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, serverCam.pitch + pendingPitch),
      );
      pred.lastSyncedCamera = serverCam;
      pred.initialized = true;
    }

    if (!pred.initialized) return;

    // Advance sub-tick accumulator for interpolation.
    tickAccRef.current += delta;
    const t = Math.min(1, tickAccRef.current / TICK_INTERVAL);

    // Interpolate between previous and current tick prediction, then add
    // pending (unconsumed) mouse/arrow deltas so rotation responds at frame
    // rate rather than waiting for the next useTick to consume them.
    const interpYaw = pred.prevYaw + (pred.yaw - pred.prevYaw) * t + deltaYawRef.current;
    const interpPitch = Math.max(
      -MAX_PITCH,
      Math.min(
        MAX_PITCH,
        pred.prevPitch + (pred.pitch - pred.prevPitch) * t + deltaPitchRef.current,
      ),
    );

    // Convert predicted rotation to Three.js quaternion and apply.
    const [qx, qy, qz, qw] = yawPitchToQuaternion(interpYaw, interpPitch);

    // For third-person (orbit) mode, recompute orbit position from predicted
    // angles so the orbit responds at frame rate too.
    if (serverCam?.mode === "third-person" && serverCam.orbitTargetId) {
      const root = streamPlaybackStore.getState().root;
      const targetGroup = root?.children.find(
        (child) => child.name === serverCam.orbitTargetId,
      );
      if (targetGroup) {
        _orbitTarget.copy(targetGroup.position);
        const entities = streamPlaybackStore.getState().entities;
        const orbitEntity = entities.get(serverCam.orbitTargetId);
        if (orbitEntity?.renderType === "Player") {
          _orbitTarget.y += 1.0;
        }

        const sx = Math.sin(interpPitch);
        const cx = Math.cos(interpPitch);
        const sz = Math.sin(interpYaw);
        const cz = Math.cos(interpYaw);
        // Camera pulls back along negative forward direction (Torque column 1
        // of Rz*Rx, converted to Three.js coords).
        // Torque forward = (-sz*cx, cz*cx, sx) → Three.js = (cz*cx, sx, -sz*cx)
        // Negate for pull-back: (-cz*cx, -sx, sz*cx)
        _orbitDir.set(-cz * cx, -sx, sz * cx);

        if (_orbitDir.lengthSq() > 1e-8) {
          _orbitDir.normalize();
          const orbitDistance = Math.max(0.1, serverCam.orbitDistance ?? 4);
          state.camera.position.copy(_orbitTarget).addScaledVector(_orbitDir, orbitDistance);
          state.camera.lookAt(_orbitTarget);
        }
      }
    } else {
      // Observer fly or first-person: override rotation only (position comes
      // from StreamingController's server snapshot interpolation).
      state.camera.quaternion.set(qx, qy, qz, qw);
    }
  }, 1);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      if (activeAdapterRef.current) {
        store.getState().setRecording(null);
        activeAdapterRef.current = null;
      }
    };
  }, [store]);

  return null;
}
