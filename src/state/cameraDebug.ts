/**
 * Live camera-decision state for the watchdog (module-mutable, written
 * each frame by the camera drivers, read by CameraDebugWatchdog). Debug
 * only — nothing renders from this.
 */
export const orbitSpringDebug = {
  targetId: null as string | null,
  frozen: false,
  handOff: false,
  jump: 0,
  active: false,
};

/** What the director is currently driving (shot + pan), for watchdog
 *  context lines. */
export const directorCamDebug = {
  shot: "",
  panState: "" as string,
  panActive: false,
};
