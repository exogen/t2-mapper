import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
} from "three";
import type { Material, Texture } from "three";
import { ribbonIndices } from "../projectileGeometry";

export function ribbonGeometry(points = 2, quadUV = true): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(points * 6), 3).setUsage(
      DynamicDrawUsage,
    ),
  );
  const uv = new Float32Array(points * 4);
  if (points === 2 && quadUV) uv.set([0, 0, 0, 1, 1, 1, 1, 0]);
  geometry.setAttribute(
    "uv",
    new BufferAttribute(uv, 2).setUsage(DynamicDrawUsage),
  );
  const index = quadUV
    ? new Uint16Array([0, 1, 2, 0, 2, 3])
    : ribbonIndices(points);
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}
export function effectMaterial(map?: Texture): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    transparent: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
}
export function effectMesh(geometry: BufferGeometry, material: Material): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}
/** Only for views that own their geometry/materials; textures belong to assets. */
export function disposeGeometry(root: Group): void {
  const geometries = new Set<BufferGeometry>(),
    materials = new Set<Material>();
  root.traverse((node) => {
    if (!(node as Mesh).isMesh && !(node as any).isSprite) return;
    const mesh = node as Mesh;
    if (mesh.geometry && !(node as any).isSprite) geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material])
      materials.add(material);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
