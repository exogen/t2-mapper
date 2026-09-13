import type { Object3D, AnimationClip } from "three";
import { readDtsSequences } from "../dts/dtsSequences";
import { NUM_TABLE_ACTION_ANIMS } from "./playerAnimation";

/** Table action names in engine order (indices 0-7). */
export const TABLE_ACTION_NAMES = [
  "root",
  "run",
  "back",
  "side",
  "fall",
  "jet",
  "jump",
  "land",
];

export interface ActionAnimEntry {
  /** DTS clip name (lowercase, e.g. "diehead"). */
  clipName: string;
  /** Engine alias (lowercase, e.g. "death1"). */
  alias: string;
}

/**
 * Build the engine's action index -> animation entry mapping from a
 * TSShapeConstructor's sequence entries (e.g. `"heavy_male_root.dsq root"`).
 *
 * The engine builds its action list as:
 * 1. Table actions (0-7): found by searching for aliased names (root, run, etc.)
 * 2. Non-table actions (8+): ALL remaining shape sequences in order.
 *
 * The shape's sequence array contains DTS-embedded sequences (e.g. JetFlare,
 * Damage) BEFORE the TSShapeConstructor-loaded ones. These occupy non-table
 * action slots and shift all TSShapeConstructor non-table indices up.
 */
export function buildActionAnimMap(
  sequences: string[],
  shapePrefix: string,
  embeddedNonTableCount: number = 0,
): Map<number, ActionAnimEntry> {
  const result = new Map<number, ActionAnimEntry>();

  // Parse each sequence entry into { clipName, alias }.
  const parsed: Array<{ clipName: string; alias: string }> = [];
  for (const entry of sequences) {
    const spaceIdx = entry.indexOf(" ");
    if (spaceIdx === -1) continue;
    const dsqFile = entry.slice(0, spaceIdx).toLowerCase();
    const alias = entry
      .slice(spaceIdx + 1)
      .trim()
      .toLowerCase();
    if (!alias || !dsqFile.startsWith(shapePrefix) || !dsqFile.endsWith(".dsq"))
      continue;
    const clipName = dsqFile.slice(shapePrefix.length, -4);
    if (clipName) parsed.push({ clipName, alias });
  }

  // Find which parsed entries are table actions (by alias name).
  const tableEntryIndices = new Set<number>();
  for (let i = 0; i < TABLE_ACTION_NAMES.length; i++) {
    const name = TABLE_ACTION_NAMES[i];
    for (let pi = 0; pi < parsed.length; pi++) {
      if (parsed[pi].alias === name) {
        tableEntryIndices.add(pi);
        result.set(i, parsed[pi]);
        break;
      }
    }
  }

  // Non-table actions: remaining entries in TSShapeConstructor order, offset
  // by embedded non-table sequences that precede them in the shape.
  let actionIdx = NUM_TABLE_ACTION_ANIMS + embeddedNonTableCount;
  for (let pi = 0; pi < parsed.length; pi++) {
    if (!tableEntryIndices.has(pi)) {
      result.set(actionIdx, parsed[pi]);
      actionIdx++;
    }
  }

  return result;
}

const TABLE_ACTION_NAME_SET = new Set(TABLE_ACTION_NAMES);

/**
 * Count DTS-embedded sequences that occupy non-table action slots. The engine's
 * shape sequence array starts with embedded sequences (e.g. JetFlare, Damage)
 * before TSShapeConstructor sequences. We detect them by comparing the native DTS sequence table with TSShapeConstructor-derived clip names.
 */
export function countEmbeddedNonTableSequences(
  scene: Object3D,
  animations: readonly AnimationClip[],
  tscSequences: string[],
  shapePrefix: string,
): number {
  const dtsNames = readDtsSequences(scene, animations).names;
  if (dtsNames.length === 0) return 0;

  // Build set of clip names derived from TSShapeConstructor DSQ entries.
  const tscClipNames = new Set<string>();
  for (const entry of tscSequences) {
    const spaceIdx = entry.indexOf(" ");
    if (spaceIdx === -1) continue;
    const dsqFile = entry.slice(0, spaceIdx).toLowerCase();
    if (!dsqFile.startsWith(shapePrefix) || !dsqFile.endsWith(".dsq")) continue;
    const clipName = dsqFile.slice(shapePrefix.length, -4);
    if (clipName) tscClipNames.add(clipName);
  }

  // Embedded sequences come first in the DTS. Count leading entries that don't
  // match any TSShapeConstructor clip name, excluding any that are table actions.
  let count = 0;
  for (const name of dtsNames) {
    if (tscClipNames.has(name)) break;
    if (!TABLE_ACTION_NAME_SET.has(name)) count++;
  }
  return count;
}
