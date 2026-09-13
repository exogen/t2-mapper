import {
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Mesh,
  NormalBlending,
  ShaderMaterial,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import type { StreamingPlayback } from "../stream/types";
import type { GroundDecal } from "./GroundEffectSimulation";
import { getParticleTexture, particleTexturesReady } from "./particleRenderer";

const vertexShader = `attribute float decalAlpha; varying vec2 vUv; varying float vAlpha;
void main(){vUv=uv;vAlpha=decalAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader = `uniform sampler2D map; varying vec2 vUv; varying float vAlpha;
void main(){gl_FragColor=texture2D(map,vUv)*vec4(1.0,1.0,1.0,vAlpha);if(gl_FragColor.a<=0.1)discard;}`;
interface Batch {
  mesh: Mesh<BufferGeometry, ShaderMaterial>;
  count: number;
  sizeX: number;
  sizeY: number;
  texture: import("three").Texture;
  decals: GroundDecal[];
  positionDirty: boolean;
  alphaDirty: boolean;
}

/** DecalManager's bounded quad pool, grouped by DecalData/texture. No geometry
 * projection or material overlays on DTS models: these are world-space marks. */
export class WorldDecalRenderer {
  private batches = new Map<number, Batch>();
  private normal = new Vector3();
  private x = new Vector3();
  private y = new Vector3();
  private p = new Vector3();
  private group: Group;
  private playback: StreamingPlayback;
  private capacity: number;
  constructor(group: Group, playback: StreamingPlayback, capacity = 256) {
    this.group = group;
    this.playback = playback;
    this.capacity = capacity;
  }
  private batch(id: number): Batch | undefined {
    let batch = this.batches.get(id);
    if (batch) return batch;
    const db = this.playback.getDataBlockData(id);
    if (!db || typeof db.textureName !== "string") return;
    const geometry = new BufferGeometry(),
      indices = new Uint16Array(this.capacity * 6),
      uv = new Float32Array(this.capacity * 8);
    for (let i = 0; i < this.capacity; i++) {
      indices.set(
        [i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3],
        i * 6,
      );
      uv.set([0, 0, 0, 1, 1, 1, 1, 0], i * 8);
    }
    geometry.setIndex(new Uint16BufferAttribute(indices, 1));
    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        new Float32Array(this.capacity * 12),
        3,
      ).setUsage(DynamicDrawUsage),
    );
    geometry.setAttribute(
      "decalAlpha",
      new Float32BufferAttribute(
        new Float32Array(this.capacity * 4),
        1,
      ).setUsage(DynamicDrawUsage),
    );
    const texture = getParticleTexture(db.textureName);
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { map: { value: texture } },
      transparent: true,
      depthWrite: true,
      depthTest: true,
      side: DoubleSide,
      blending: NormalBlending,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    batch = {
      mesh,
      count: 0,
      sizeX: Number(db.sizeX),
      sizeY: Number(db.sizeY),
      texture,
      decals: [],
      positionDirty: false,
      alphaDirty: false,
    };
    this.batches.set(id, batch);
    return batch;
  }
  update(decals: readonly GroundDecal[], now: number, timeout: number): void {
    for (const batch of this.batches.values()) {
      batch.count = 0;
      batch.positionDirty = batch.alphaDirty = false;
    }
    for (const decal of decals) {
      const batch = this.batch(decal.dataBlockId);
      if (!batch || batch.count >= this.capacity) continue;
      const age = now - decal.timeSec;
      if (age < 0 || age > timeout) continue;
      const pos = batch.mesh.geometry.getAttribute("position"),
        alpha = batch.mesh.geometry.getAttribute("decalAlpha");
      if (batch.decals[batch.count] !== decal) {
        this.normal.fromArray(decal.normal).normalize();
        this.y.fromArray(decal.forward);
        this.x
          .crossVectors(this.y, this.normal)
          .normalize()
          .multiplyScalar(batch.sizeX);
        this.y
          .crossVectors(this.normal, this.x)
          .normalize()
          .multiplyScalar(batch.sizeY);
        this.p.fromArray(decal.point).addScaledVector(this.normal, 0.008);
        for (let i = 0; i < 4; i++) {
          const sx = i < 2 ? 1 : -1,
            sy = i === 0 || i === 3 ? 1 : -1;
          const x = this.p.x + sx * this.x.x + sy * this.y.x,
            y = this.p.y + sx * this.x.y + sy * this.y.y,
            z = this.p.z + sx * this.x.z + sy * this.y.z;
          pos.setXYZ(batch.count * 4 + i, y, z, x);
        }
        batch.positionDirty = true;
        batch.decals[batch.count] = decal;
      }
      const fade = Math.fround(
        Math.min(1, Math.max(0, (timeout - age) / (timeout * 0.25))),
      );
      if (alpha.getX(batch.count * 4) !== fade) {
        for (let i = 0; i < 4; i++) alpha.setX(batch.count * 4 + i, fade);
        batch.alphaDirty = true;
      }
      batch.count++;
    }
    for (const batch of this.batches.values()) {
      const geometry = batch.mesh.geometry;
      batch.mesh.visible =
        batch.count > 0 && particleTexturesReady.has(batch.texture);
      geometry.setDrawRange(0, batch.count * 6);
      batch.decals.length = batch.count;
      for (const [name, dirty] of [
        ["position", batch.positionDirty],
        ["decalAlpha", batch.alphaDirty],
      ] as const) {
        if (!dirty) continue;
        const a = geometry.getAttribute(name) as Float32BufferAttribute;
        a.clearUpdateRanges();
        a.addUpdateRange(0, batch.count * 4 * a.itemSize);
        a.needsUpdate = true;
      }
    }
  }
  updateTextureVisibility(): void {
    for (const batch of this.batches.values())
      batch.mesh.visible =
        batch.count > 0 && particleTexturesReady.has(batch.texture);
  }
  dispose(): void {
    for (const { mesh } of this.batches.values()) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.batches.clear();
  }
}
