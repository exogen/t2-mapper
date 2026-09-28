import { BufferAttribute, type BufferGeometry, Matrix4, Vector3 } from "three";

export interface ChestRegion {
  start: number;
  count: number;
  transform?: Matrix4;
}

// Stock torsos remain well below these limits. An unexpected/custom mesh must
// not multiply into an unbounded allocation on the render thread.
const MAX_VERTICES = 16_384;
const MAX_INDICES = 98_304;

/** Split edges without moving the original surface. Edge decisions depend only
 * on position, so adjacent triangles and duplicated UV seams stay watertight. */
export function subdivideChestGeometry(
  source: BufferGeometry,
  regions: readonly ChestRegion[],
  intersectsChest: (a: Vector3, b: Vector3) => boolean,
  passes: number,
) {
  const count = source.getAttribute("position").count;
  if (count > MAX_VERTICES || (source.index?.count ?? count) > MAX_INDICES)
    throw new Error("Chest mesh exceeds the subdivision budget");
  const geometry = source.clone();
  const owners = new Array<number>(count).fill(-1);
  regions.forEach((region, i) =>
    owners.fill(i, region.start, region.start + region.count),
  );
  if (passes === 0) return { geometry, owners };

  const attributes = Object.entries(geometry.attributes).map(
    ([name, attr]) => ({
      name,
      attr,
      values: Array.from(attr.array),
    }),
  );
  const positions = attributes.find(({ name }) => name === "position")!.values;
  const inverse = regions.map((region) => region.transform?.clone().invert());
  const a = new Vector3(),
    b = new Vector3();
  let indices = source.index
    ? Array.from(source.index.array)
    : Array.from({ length: count }, (_, i) => i);
  // Prefix counts remap material groups and draw ranges after each split.
  for (let pass = 0; pass < passes; pass++) {
    const midpoints = new Map<string, number>();
    const midpoint = (i: number, j: number): number => {
      const owner = owners[i];
      if (owner < 0 || owner !== owners[j]) return -1;
      const key = i < j ? `${i}/${j}` : `${j}/${i}`;
      const cached = midpoints.get(key);
      if (cached !== undefined) return cached;
      a.fromArray(positions, i * 3);
      b.fromArray(positions, j * 3);
      if (inverse[owner]) {
        a.applyMatrix4(inverse[owner]!);
        b.applyMatrix4(inverse[owner]!);
      }
      if (a.distanceToSquared(b) <= 0.055 ** 2 || !intersectsChest(a, b)) {
        midpoints.set(key, -1);
        return -1;
      }
      const index = owners.length;
      if (index >= MAX_VERTICES)
        throw new Error("Chest subdivision exceeds the vertex budget");
      owners.push(owner);
      for (const { attr, values } of attributes)
        for (let component = 0; component < attr.itemSize; component++)
          values.push(
            (values[i * attr.itemSize + component] +
              values[j * attr.itemSize + component]) /
              2,
          );
      midpoints.set(key, index);
      return index;
    };
    const next: number[] = [];
    const offsets = new Map<number, number>();
    for (let i = 0; i < indices.length; i += 3) {
      offsets.set(i, next.length);
      const a = indices[i],
        b = indices[i + 1],
        c = indices[i + 2];
      const ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      const mask = (ab >= 0 ? 1 : 0) | (bc >= 0 ? 2 : 0) | (ca >= 0 ? 4 : 0);
      switch (mask) {
        case 0:
          next.push(a, b, c);
          break;
        case 1:
          next.push(a, ab, c, ab, b, c);
          break;
        case 2:
          next.push(a, b, bc, a, bc, c);
          break;
        case 4:
          next.push(a, b, ca, ca, b, c);
          break;
        case 3:
          next.push(ab, b, bc, a, ab, c, ab, bc, c);
          break;
        case 5:
          next.push(a, ab, ca, ab, b, c, ab, c, ca);
          break;
        case 6:
          next.push(ca, bc, c, a, b, ca, b, bc, ca);
          break;
        case 7:
          next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
          break;
      }
      if (next.length > MAX_INDICES)
        throw new Error("Chest subdivision exceeds the triangle budget");
    }
    offsets.set(indices.length, next.length);
    for (const group of geometry.groups) {
      const start = offsets.get(group.start)!;
      group.count = offsets.get(group.start + group.count)! - start;
      group.start = start;
    }
    const { start, count: drawCount } = geometry.drawRange;
    geometry.setDrawRange(
      offsets.get(start) ?? 0,
      Number.isFinite(drawCount)
        ? (offsets.get(Math.min(indices.length, start + drawCount)) ??
            next.length) - (offsets.get(start) ?? 0)
        : Infinity,
    );
    if (next.length === indices.length) break;
    indices = next;
  }
  for (const { name, attr, values } of attributes) {
    const ArrayType = attr.array.constructor as {
      new (values: number[]): typeof attr.array;
    };
    geometry.setAttribute(
      name,
      new BufferAttribute(
        new ArrayType(values),
        attr.itemSize,
        attr.normalized,
      ),
    );
  }
  geometry.setIndex(indices);
  return { geometry, owners };
}
