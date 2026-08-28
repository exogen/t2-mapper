import type { Vector3 } from "three";

/**
 * Per-entity animated eye bone position in model space (GLB coordinates).
 * Written by PlayerModel after mixer.update(), read by StreamingController
 * for first-person camera positioning and by GenericShape. Lives in its
 * own module so those readers don't import PlayerModel (which imports
 * GenericShape — a cycle otherwise).
 */
export const playerEyePositions = new Map<string, Vector3>();
