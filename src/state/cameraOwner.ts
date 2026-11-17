import { cameraTourStore, useCameraTour } from "./cameraTourStore";
import { commandCircuitStore, useCommandCircuit } from "./commandCircuitStore";
import { demoDirectorStore, useDirector } from "./demoDirectorStore";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { isFollowTargetPlayer } from "./watchFollow";
import { clipStore } from "./clipStore";
import { useStore } from "zustand";

/**
 * Who is driving the view right now.
 *
 * These owners are mutually exclusive and strictly ordered: a recorded clip
 * outranks map tours, then the auto-director, then the command circuit,
 * and only when none of them is up does local input own the camera.
 * Several components used to re-derive this from the same three stores
 * in the same order; ask here instead so a new mode has one place to
 * take its turn.
 *
 * The stream is not an owner: it writes the pose every mode except
 * free-fly starts from (see framePriority.ts), and each owner above
 * overrides it in the same frame.
 */
export type CameraOwner =
  "clip" | "tour" | "director" | "commandCircuit" | "input";

function ownerOf(
  clipActive: boolean,
  tourActive: boolean,
  directing: boolean,
  commandCircuit: boolean,
): CameraOwner {
  if (clipActive) return "clip";
  if (tourActive) return "tour";
  if (directing) return "director";
  if (commandCircuit) return "commandCircuit";
  return "input";
}

/** The current owner, for frame callbacks and other imperative code. */
export function resolveCameraOwner(): CameraOwner {
  return ownerOf(
    clipStore.getState().active !== null,
    cameraTourStore.getState().animation !== null,
    demoDirectorStore.getState().status === "playing",
    commandCircuitStore.getState().active,
  );
}

/** The current owner, re-rendering the component when it changes. */
export function useCameraOwner(): CameraOwner {
  const clipActive = useStore(clipStore, (state) => state.active !== null);
  const tourActive = useCameraTour((s) => s.animation !== null);
  const directing = useDirector((s) => s.status === "playing");
  const commandCircuit = useCommandCircuit((s) => s.active);
  return ownerOf(clipActive, tourActive, directing, commandCircuit);
}

/** Lock local player orbits, including flag carriers; other owners keep control. */
export function isPlayerOrbitLocked(enabled: boolean): boolean {
  return (
    enabled &&
    streamPlaybackStore.getState().cameraMode === "orbitOverride" &&
    resolveCameraOwner() === "input" &&
    isFollowTargetPlayer()
  );
}
