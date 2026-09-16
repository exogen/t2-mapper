import type { AnimationClip, AnimationAction, AnimationMixer } from "three";
import type { DTSAnimationClip } from "../dts/dtsModel";
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

/** Named engine actions and exact network indices share the same table.
 * Raw DSQ filenames are only used to locate clips, never as engine aliases. */
export function getPlayerAnimationActions(
  clips: readonly AnimationClip[],
  mixer: AnimationMixer,
  actionMap: ReadonlyMap<number, ActionAnimEntry>,
): Map<string | number, AnimationAction> {
  const byName = new Map(clips.map((clip) => [clip.name.toLowerCase(), clip]));
  const actions = new Map<string | number, AnimationAction>();
  for (const [index, { alias, clipName }] of actionMap) {
    const clip = byName.get(clipName);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    actions.set(index, action);
    if (!actions.has(alias)) actions.set(alias, action);
  }
  return actions;
}

/** PlayerData::preload (0x5cddf0): fixed table actions first, then every
 * remaining sequence in shape order. TSShapeConstructor (0x6bd1b0) imports
 * each DSQ in declaration order and renames only its last sequence. */
export function buildActionAnimMap(
  sequences: readonly string[],
  shapePrefix: string,
  clips: readonly DTSAnimationClip[],
): Map<number, ActionAnimEntry> {
  const entries: ActionAnimEntry[] = [];
  const sources = new Map<string, ActionAnimEntry[]>();
  for (const clip of clips) {
    const source = clip.sequence?.source;
    const entry = {
      clipName: clip.name.toLowerCase(),
      alias: (source?.sequenceName ?? clip.name).toLowerCase(),
    };
    if (!source) {
      entries.push(entry);
    } else if (source.name) {
      const key = source.name.toLowerCase();
      let imported = sources.get(key);
      if (!imported) sources.set(key, (imported = []));
      imported.push(entry);
    }
  }
  for (const entry of sequences) {
    const match = /^(\S+)(?:[ \t]+(.+?))?\s*$/.exec(entry.trim());
    if (!match) continue;
    const file = match[1].toLowerCase().replace(/\\/g, "/").split("/").pop()!;
    if (!file.startsWith(shapePrefix) || !file.endsWith(".dsq")) continue;
    const imported = sources.get(file.slice(shapePrefix.length, -4));
    if (!imported?.length) continue;
    // A DSQ can be imported more than once with different aliases. Preserve
    // both action slots without duplicating its keyframe buffers.
    entries.push(...imported.slice(0, -1), {
      ...imported[imported.length - 1],
      alias: match[2]?.toLowerCase() ?? imported[imported.length - 1].alias,
    });
  }

  const result = new Map<number, ActionAnimEntry>();
  const tableEntries = new Set<number>();
  TABLE_ACTION_NAMES.forEach((name, index) => {
    const sequence = entries.findIndex((entry) => entry.alias === name);
    if (sequence !== -1) {
      result.set(index, entries[sequence]);
      tableEntries.add(sequence);
    }
  });
  let index = NUM_TABLE_ACTION_ANIMS;
  entries.forEach((entry, sequence) => {
    if (!tableEntries.has(sequence)) result.set(index++, entry);
  });
  return result;
}
