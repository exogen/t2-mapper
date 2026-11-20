import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
} from "three";
import type { Material, Texture } from "three";
import { ribbonIndices } from "./projectileGeometry";

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

/** Splash and shockwave rings both modulate raw texture and vertex RGBA. */
export function createEffectRingMaterial(texture: Texture): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec4 vertexColor;
      attribute vec2 texCoord;
      varying vec4 vColor;
      varying vec2 vUV;
      void main() {
        vColor = vertexColor;
        vUV = texCoord;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTexture;
      varying vec4 vColor;
      varying vec2 vUV;
      void main() {
        gl_FragColor = vColor * texture2D(uTexture, vUV);
      }
    `,
    uniforms: { uTexture: { value: texture } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
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
