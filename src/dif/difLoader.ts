import {
  BufferAttribute,
  BufferGeometry,
  FileLoader,
  Group,
  LinearFilter,
  Loader,
  Mesh,
  MeshLambertMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";
import {
  DIFSurfaceFlags,
  parseDIF,
  type DIFInterior,
  type DIFSurface,
} from "./dif";
import { DIFCollision } from "./difCollision";

/** DIF has surface flags and texture names, not DTS material flags. */
export class DIFMaterial extends MeshLambertMaterial {
  resourcePath = "";
  surfaceFlags = 0;
  normalLightMapIndex = 0xff;
  alarmLightMapIndex = 0xff;

  get outsideVisible(): boolean {
    return (this.surfaceFlags & DIFSurfaceFlags.OutsideVisible) !== 0;
  }

  override copy(source: this): this {
    super.copy(source);
    this.resourcePath = source.resourcePath;
    this.surfaceFlags = source.surfaceFlags;
    this.normalLightMapIndex = source.normalLightMapIndex;
    this.alarmLightMapIndex = source.alarmLightMapIndex;
    return this;
  }
}

export type DIFMesh = Mesh<BufferGeometry, DIFMaterial>;
export interface DIFModel {
  scene: Group;
  /** Avoid "meshes": useLoader reserves it for buildGraph's name lookup. */
  surfaceMeshes: DIFMesh[];
  lightMaps: Texture[];
  /** The selected detail's original render data, without glTF extras. */
  interior: DIFInterior;
  /** Collision always uses file-order detail 0, independently of rendering. */
  collision: DIFCollision;
  collisionLightMaps: Texture[];
}

/**
 * Build the highest detail by default, matching the old conversion. A caller
 * can select another file-order LOD without displaying overlapping levels.
 * Image decoding is separate so Node collision consumers need no DOM/polyfills.
 */
export function createDIFModel(buffer: ArrayBuffer, detailIndex = 0): DIFModel {
  const file = parseDIF(buffer);
  const interior = file.interiors[detailIndex];
  if (!interior)
    throw new Error(`DIF detail index ${detailIndex} is out of range`);
  const scene = new Group();
  scene.name = "DIF";
  const createLightMaps = (detail: DIFInterior) =>
    detail.lightMaps.map((_, index) => {
      const texture = new Texture();
      texture.name = `DIF lightmap ${index}`;
      texture.channel = 1; // uv1, directly from DIF's packed lightmap texgen
      texture.flipY = false;
      texture.colorSpace = SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = texture.magFilter = LinearFilter;
      return texture;
    });
  const lightMaps = createLightMaps(interior);
  const collision = new DIFCollision(file.interiors[0], file.vehicleCollision);
  const collisionLightMaps =
    interior === file.interiors[0]
      ? lightMaps
      : createLightMaps(file.interiors[0]);

  type Batch = {
    material: DIFMaterial;
    surfaces: DIFSurface[];
    vertexCount: number;
    indexCount: number;
  };
  const batches = new Map<string, Batch>();
  for (const [surfaceIndex, surface] of interior.surfaces.entries()) {
    const normalMap = interior.normalLightMapIndices[surfaceIndex];
    const alarmMap = interior.alarmLightMapIndices[surfaceIndex] ?? 0xff;
    // Including flags fixes io_dif's OR-ing of inside/outside surfaces sharing
    // a texture + atlas. Their scene-lighting rules must stay independent.
    const key = `${surface.textureIndex}/${normalMap}/${alarmMap}/${surface.flags}`;
    let batch = batches.get(key);
    if (!batch) {
      const material = new DIFMaterial({ toneMapped: false });
      material.resourcePath = interior.materialNames[surface.textureIndex];
      material.name = material.resourcePath;
      material.surfaceFlags = surface.flags;
      material.normalLightMapIndex = normalMap;
      material.alarmLightMapIndex = alarmMap;
      material.lightMap = lightMaps[normalMap] ?? null;
      batch = {
        material,
        surfaces: [],
        vertexCount: 0,
        indexCount: 0,
      };
      batches.set(key, batch);
    }
    batch.surfaces.push(surface);
    batch.vertexCount += surface.windingCount;
    batch.indexCount += (surface.windingCount - 2) * 3;
  }

  const surfaceMeshes: DIFMesh[] = [];
  for (const batch of batches.values()) {
    // Allocate final GPU buffers once, avoiding growable JS arrays and copies.
    const positions = new Float32Array(batch.vertexCount * 3);
    const normals = new Float32Array(batch.vertexCount * 3);
    const uv = new Float32Array(batch.vertexCount * 2);
    const uv1 = new Float32Array(batch.vertexCount * 2);
    // 0xffff is reserved for primitive restart in WebGL 2.
    const indices =
      batch.vertexCount > 0xffff
        ? new Uint32Array(batch.indexCount)
        : new Uint16Array(batch.indexCount);
    let base = 0;
    let indexOffset = 0;
    for (const surface of batch.surfaces) {
      const plane = interior.planes[surface.planeIndex & 0x7fff];
      const normal = interior.normals[plane.normalIndex];
      const sign = surface.planeIndex & 0x8000 ? -1 : 1;
      const [s, t] = interior.texGen[surface.texGenIndex];
      const [ls, lt] = surface.lightMapTexGen;
      for (let i = 0; i < surface.windingCount; i++) {
        const [x, y, z] =
          interior.points[interior.windings[surface.windingStart + i]];
        const p = (base + i) * 3;
        const u = (base + i) * 2;
        // Same cyclic swizzle as scene/coordinates.ts: no Blender quarter-turn.
        positions[p] = y;
        positions[p + 1] = z;
        positions[p + 2] = x;
        normals[p] = sign * normal[1];
        normals[p + 1] = sign * normal[2];
        normals[p + 2] = sign * normal[0];
        uv[u] = x * s[0] + y * s[1] + z * s[2] + s[3];
        uv[u + 1] = x * t[0] + y * t[1] + z * t[2] + t[3];
        uv1[u] = x * ls[0] + y * ls[1] + z * ls[2] + ls[3];
        uv1[u + 1] = x * lt[0] + y * lt[1] + z * lt[2] + lt[3];
      }
      // DIF windings are clockwise triangle strips. Reverse each triangle for
      // Three's CCW front faces, alternating parity; plane normals stay flat.
      // fanMask is for Torque's alternate fan rendering, not a triangle mask.
      for (let i = 2; i < surface.windingCount; i++) {
        indices[indexOffset++] = base + i - 2;
        indices[indexOffset++] = base + (i % 2 ? i - 1 : i);
        indices[indexOffset++] = base + (i % 2 ? i : i - 1);
      }
      base += surface.windingCount;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new BufferAttribute(uv, 2));
    geometry.setAttribute("uv1", new BufferAttribute(uv1, 2));
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, batch.material);
    mesh.name = `${batch.material.name}:${surfaceMeshes.length}`;
    mesh.castShadow = mesh.receiveShadow = true;
    surfaceMeshes.push(mesh);
    scene.add(mesh);
  }
  return {
    scene,
    surfaceMeshes,
    lightMaps,
    interior,
    collision,
    collisionLightMaps,
  };
}

/** Native DIF loader for useLoader / loadAsync; only embedded PNGs need a DOM. */
export class DIFLoader extends Loader<DIFModel> {
  override load(
    url: string,
    onLoad: (model: DIFModel) => void,
    onProgress?: Parameters<FileLoader["load"]>[2],
    onError?: (error: unknown) => void,
  ): void {
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.load(
      url,
      (buffer) => {
        this.parseAsync(buffer as ArrayBuffer).then(onLoad, (error) => {
          onError?.(error);
          this.manager.itemError(url);
        });
      },
      onProgress,
      onError,
    );
  }

  /** Synchronous geometry/material construction, also usable in Node. */
  parse(buffer: ArrayBuffer): DIFModel {
    return createDIFModel(buffer);
  }

  async parseAsync(buffer: ArrayBuffer): Promise<DIFModel> {
    const model = this.parse(buffer);
    // TextureLoader works in browsers without createImageBitmap as well. Blob
    // URLs are scoped to each decode and revoked on both success and failure.
    const textureLoader = new TextureLoader(this.manager);
    const results = await Promise.allSettled(
      [
        ...model.interior.lightMaps.map((map, index) => ({
          ...map,
          texture: model.lightMaps[index],
        })),
        ...(model.collisionLightMaps === model.lightMaps
          ? []
          : model.collision.interior.lightMaps.map((map, index) => ({
              ...map,
              texture: model.collisionLightMaps[index],
            }))),
      ].map(async ({ png, texture }) => {
        const url = URL.createObjectURL(new Blob([png], { type: "image/png" }));
        try {
          const loaded = await textureLoader.loadAsync(url);
          texture.image = loaded.image;
          texture.needsUpdate = true;
          loaded.dispose();
        } finally {
          URL.revokeObjectURL(url);
        }
      }),
    );
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") {
      disposeDIFModel(model);
      throw failure.reason;
    }
    return model;
  }
}

/** For manually managed loaders; useLoader caches are owned by the caller. */
export function disposeDIFModel(model: DIFModel): void {
  model.collision.dispose();
  for (const mesh of model.surfaceMeshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  for (const texture of model.lightMaps) texture.dispose();
  if (model.collisionLightMaps !== model.lightMaps)
    for (const texture of model.collisionLightMaps) texture.dispose();
}
