import type { AnimationAction, AnimationClip, AnimationMixer } from "three";
import type { TorqueRuntime } from "./types";

/**
 * Outer key: shape filename (lowercase, e.g. "light_male.dts").
 * Inner map: alias (lowercase) -> GLB clip name (lowercase).
 */
export type SequenceAliasMap = Map<string, Map<string, string>>;

/**
 * Build sequence alias maps from TSShapeConstructor datablocks already
 * registered in the runtime. Each datablock has `baseshape` and
 * `sequence0`–`sequence127` properties like:
 *
 *     sequence1 = "light_male_forward.dsq run"
 *
 * The GLB clip name is derived by stripping the DTS model prefix and .dsq
 * extension from the DSQ filename, matching the Blender addon's
 * `dsq_name_from_filename` behavior.
 */
export function buildSequenceAliasMap(
  runtime: TorqueRuntime,
): SequenceAliasMap {
  const result: SequenceAliasMap = new Map();

  for (const obj of runtime.state.datablocks.values()) {
    if (obj._class !== "tsshapeconstructor") continue;

    const baseShape = obj.baseshape;
    if (typeof baseShape !== "string") continue;

    const shapeKey = baseShape.toLowerCase();
    // Derive prefix: "light_male.dts" -> "light_male_"
    const stem = shapeKey.replace(/\.dts$/i, "");
    const prefix = stem + "_";

    const aliases = new Map<string, string>();

    for (let i = 0; i <= 127; i++) {
      const value = obj[`sequence${i}`];
      if (typeof value !== "string") continue;

      // Format: "filename.dsq alias"
      const spaceIdx = value.indexOf(" ");
      if (spaceIdx === -1) continue;

      const dsqFile = value.slice(0, spaceIdx).toLowerCase();
      const alias = value
        .slice(spaceIdx + 1)
        .trim()
        .toLowerCase();
      if (!alias) continue;

      // Strip prefix and .dsq to get the GLB clip name.
      // Only process DSQs matching the model prefix (others won't be in the GLB).
      if (!dsqFile.startsWith(prefix) || !dsqFile.endsWith(".dsq")) continue;

      const clipName = dsqFile.slice(prefix.length, -4);
      if (clipName) {
        aliases.set(alias, clipName);
      }
    }

    if (aliases.size > 0) {
      result.set(shapeKey, aliases);
    }
  }

  return result;
}

/**
 * Build a case-insensitive action map from GLB clips, augmented with
 * TSShapeConstructor aliases. Both the original clip name and the alias
 * resolve to the same AnimationAction.
 */
export function getAliasedActions(
  clips: AnimationClip[],
  mixer: AnimationMixer,
  aliases: Map<string, string> | undefined,
): Map<string, AnimationAction> {
  const actions = new Map<string, AnimationAction>();

  for (const clip of clips) {
    const action = mixer.clipAction(clip);
    actions.set(clip.name.toLowerCase(), action);
  }

  if (aliases) {
    for (const [alias, clipName] of aliases) {
      const action = actions.get(clipName);
      if (action && !actions.has(alias)) {
        actions.set(alias, action);
      }
    }
  }

  return actions;
}
