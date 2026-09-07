import { cameraTourStore, useCameraTour } from "./cameraTourStore";
import { commandCircuitStore, useCommandCircuit } from "./commandCircuitStore";
import { demoDirectorStore, useDirector } from "./demoDirectorStore";

/**
 * Who is driving the view right now.
 *
 * These four are mutually exclusive and strictly ordered: a running map
 * tour outranks the auto-director, which outranks the command circuit,
 * and only when none of them is up does local input own the camera.
 * Several components used to re-derive this from the same three stores
 * in the same order; ask here instead so a new mode has one place to
 * take its turn.
 *
 * The stream is not an owner: it writes the pose every mode except
 * free-fly starts from (see framePriority.ts), and each owner above
 * overrides it in the same frame.
 */
export type CameraOwner = "tour" | "director" | "commandCircuit" | "input";

function ownerOf(
  tourActive: boolean,
  directing: boolean,
  commandCircuit: boolean,
): CameraOwner {
  if (tourActive) return "tour";
  if (directing) return "director";
  if (commandCircuit) return "commandCircuit";
  return "input";
}

/** The current owner, for frame callbacks and other imperative code. */
export function resolveCameraOwner(): CameraOwner {
  return ownerOf(
    cameraTourStore.getState().animation !== null,
    demoDirectorStore.getState().status === "playing",
    commandCircuitStore.getState().active,
  );
}

/** The current owner, re-rendering the component when it changes. */
export function useCameraOwner(): CameraOwner {
  const tourActive = useCameraTour((s) => s.animation !== null);
  const directing = useDirector((s) => s.status === "playing");
  const commandCircuit = useCommandCircuit((s) => s.active);
  return ownerOf(tourActive, directing, commandCircuit);
}
