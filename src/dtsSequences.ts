import type { AnimationClip, Object3D } from "three";

/**
 * The DTS sequence table the exporter writes onto the GLB scene as
 * JSON-string extras: `dts_sequence_names` in DTS order (the engine's
 * thread and image-state tables index this order), with parallel
 * `dts_sequence_cyclic` and `dts_sequence_blend` flags. Names are
 * lower-cased: DTS sequence lookups are case-insensitive.
 */
export interface DtsSequenceTable {
  /** DTS sequence index → lower-cased name. */
  names: readonly string[];
  /** Lower-cased names of the sequences flagged cyclic. */
  cyclic: ReadonlySet<string>;
  /** Lower-cased names of the blend sequences (DTS flag 0x8). */
  blend: ReadonlySet<string>;
  /** Whether the scene carried the table (else `names` are the clips). */
  fromExtras: boolean;
}

const _tables = new WeakMap<Object3D, DtsSequenceTable>();

function readJsonExtra<T>(scene: Object3D, key: string): T | null {
  const raw = scene.userData?.[key];
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * The scene's sequence table, parsed once per GLB scene. Without the
 * extras the clips stand in for the names and every clip counts as
 * cyclic, which is what older conversions get.
 */
export function readDtsSequences(
  scene: Object3D,
  animations: readonly AnimationClip[],
): DtsSequenceTable {
  const cached = _tables.get(scene);
  if (cached) return cached;
  const rawNames = readJsonExtra<string[]>(scene, "dts_sequence_names");
  let table: DtsSequenceTable;
  if (Array.isArray(rawNames)) {
    const names = rawNames.map((n) => String(n).toLowerCase());
    const cyclicFlags =
      readJsonExtra<boolean[]>(scene, "dts_sequence_cyclic") ?? [];
    const blendFlags =
      readJsonExtra<boolean[]>(scene, "dts_sequence_blend") ?? [];
    const cyclic = new Set<string>();
    const blend = new Set<string>();
    names.forEach((name, i) => {
      // A missing cyclic flag means the addon predates the extra: cyclic.
      if (cyclicFlags[i] ?? true) cyclic.add(name);
      if (blendFlags[i]) blend.add(name);
    });
    table = { names, cyclic, blend, fromExtras: true };
  } else {
    const names = animations.map((clip) => clip.name.toLowerCase());
    table = {
      names,
      cyclic: new Set(names),
      blend: new Set(),
      fromExtras: false,
    };
  }
  _tables.set(scene, table);
  return table;
}
