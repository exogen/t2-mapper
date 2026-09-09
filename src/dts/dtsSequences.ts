import {
  AdditiveAnimationBlendMode,
  type AnimationClip,
  type Object3D,
} from "three";
import { DTSShape } from "./dtsModel";
import { DTSSequenceFlags } from "./dtsTypes";

/** DTS order is significant: engine thread/image-state packets use indices. */
export interface DtsSequenceTable {
  names: readonly string[];
  cyclic: ReadonlySet<string>;
  blend: ReadonlySet<string>;
}
const tables = new WeakMap<Object3D, DtsSequenceTable>();
export function readDtsSequences(
  scene: Object3D,
  animations: readonly AnimationClip[],
): DtsSequenceTable {
  const cached = tables.get(scene);
  if (cached) return cached;
  const names =
    scene instanceof DTSShape
      ? scene.data.sequences.map((s) =>
          scene.data.names[s.nameIndex].toLowerCase(),
        )
      : animations.map((clip) => clip.name.toLowerCase());
  const cyclic = new Set<string>(),
    blend = new Set<string>();
  names.forEach((name, i) => {
    const sequence =
      scene instanceof DTSShape ? scene.data.sequences[i] : undefined;
    if (!sequence || sequence.flags & DTSSequenceFlags.Cyclic) cyclic.add(name);
    if (
      sequence
        ? sequence.flags & DTSSequenceFlags.Blend
        : animations[i]?.blendMode === AdditiveAnimationBlendMode
    )
      blend.add(name);
  });
  const table = { names, cyclic, blend };
  tables.set(scene, table);
  return table;
}
