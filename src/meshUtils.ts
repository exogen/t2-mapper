/**
 * Extract hull bone indices from a skeleton
 * @param skeleton - The Three.js skeleton to scan
 * @returns Set of bone indices for bones matching the hull pattern (starts with "Hulk")
 */
export function getHullBoneIndices(skeleton: any): Set<number> {
  const hullBoneIndices = new Set<number>();

  skeleton.bones.forEach((bone: any, index: number) => {
    if (bone.name.match(/^Hulk/i)) {
      hullBoneIndices.add(index);
    }
  });

  return hullBoneIndices;
}

/**
 * Filter geometry by removing faces influenced by hull bones
 * @param geometry - The Three.js geometry to filter
 * @param hullBoneIndices - Set of bone indices that represent hull (collision) geometry
 * @returns Filtered geometry with hull-influenced faces removed
 */
export function filterGeometryByVertexGroups(
  geometry: any,
  hullBoneIndices: Set<number>
): any {
  // If no hull bones or no skinning data, return original geometry
  if (hullBoneIndices.size === 0 || !geometry.attributes.skinIndex) {
    return geometry;
  }

  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  const index = geometry.index;

  // Track which vertices are influenced by hull bones
  const vertexHasHullInfluence = new Array(skinIndex.count).fill(false);

  // Check each vertex's bone influences
  for (let i = 0; i < skinIndex.count; i++) {
    for (let j = 0; j < 4; j++) {
      const boneIndex = skinIndex.array[i * 4 + j];
      const weight = skinWeight.array[i * 4 + j];

      // If this vertex has significant weight to a hull bone, mark it
      if (weight > 0.01 && hullBoneIndices.has(boneIndex)) {
        vertexHasHullInfluence[i] = true;
        break;
      }
    }
  }

  // Build new index array excluding faces that use hull-influenced vertices
  if (index) {
    const newIndices: number[] = [];
    const indexArray = index.array;

    for (let i = 0; i < indexArray.length; i += 3) {
      const i0 = indexArray[i];
      const i1 = indexArray[i + 1];
      const i2 = indexArray[i + 2];

      // Only keep face if all vertices don't have hull influence
      if (
        !vertexHasHullInfluence[i0] &&
        !vertexHasHullInfluence[i1] &&
        !vertexHasHullInfluence[i2]
      ) {
        newIndices.push(i0, i1, i2);
      }
    }

    // Create new geometry with filtered indices
    const filteredGeometry = geometry.clone();
    filteredGeometry.setIndex(newIndices);
    return filteredGeometry;
  }

  return geometry;
}
