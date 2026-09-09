import type { DTSShapeData } from "./dtsTypes";

interface DTSNodeLookup {
  /** TSShape::findName (first case-insensitive name) then findNode (first index). */
  names: ReadonlyMap<string, number>;
  /** Case-sensitive lookup for Three's getObjectByName API. */
  exactNames: ReadonlyMap<string, number>;
  mounts: Int32Array;
}

const lookups = new WeakMap<DTSShapeData, DTSNodeLookup>();

/** Shared by every instance of an immutable parsed DTS asset. */
export function getDTSNodeLookup(data: DTSShapeData): DTSNodeLookup {
  const cached = lookups.get(data);
  if (cached) return cached;
  const firstNames = new Map<string, number>();
  data.names.forEach((name, index) => {
    const lower = name.toLowerCase();
    if (!firstNames.has(lower)) firstNames.set(lower, index);
  });
  const nodes = new Map<number, number>(),
    exactNames = new Map<string, number>();
  data.nodes.forEach((node, index) => {
    if (!nodes.has(node.nameIndex)) nodes.set(node.nameIndex, index);
    const name = data.names[node.nameIndex];
    if (!exactNames.has(name)) exactNames.set(name, index);
  });
  const names = new Map<string, number>();
  for (const [name, nameIndex] of firstNames) {
    const node = nodes.get(nameIndex);
    if (node !== undefined) names.set(name, node);
  }
  const mounts = Int32Array.from(
    { length: 32 },
    (_, i) => names.get(i === 31 ? "airepairnode" : `mount${i}`) ?? -1,
  );
  const result = { names, exactNames, mounts };
  lookups.set(data, result);
  return result;
}
