/**
 * Loading `.glb` map geometry in bare Node, with no browser and no
 * Web Worker.
 *
 * Interiors (.dif) and shapes (.dts) are both converted to Draco-
 * compressed glTF, and three's stock loaders assume a browser for two
 * unrelated reasons. Both are in three's ASSET LOADING layer — none of
 * our own algorithms need a DOM — so both can be worked around without
 * touching the assets or forking three:
 *
 * 1. DRACOLoader spawns a Web Worker, and `Worker` is undefined here.
 *    `setWorkerLimit(0)` does NOT help: DRACOLoader reads
 *    `if (workerPool.length < workerLimit) new Worker(...)`, so a limit
 *    of zero just indexes an empty pool. But GLTFLoader only ever calls
 *    TWO methods on the object you give it — `preload()` and
 *    `decodeDracoFile()` — so we supply our own, backed by the
 *    `draco3d` WASM decoder's Node build.
 *
 * 2. GLTFLoader decodes textures through an ImageBitmap/Image path.
 *    Rather than strip textures from the assets, we register a plugin
 *    whose `loadTexture` short-circuits it: `_invokeOne` returns the
 *    first truthy plugin result, so nothing ever reaches the image
 *    decoder.
 *
 * Collision needs only `geometry.attributes.position` and the index
 * buffer (see `buildMeshColliders` in collision/worldCollision.ts), so
 * we decode nothing else — no normals, no UVs, no materials.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Texture,
  type Group,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createLogger } from "../logger";

const log = createLogger("nodeGltf");

type DracoDecoderModule = {
  Decoder: new () => any;
  DecoderBuffer: new () => any;
  TRIANGULAR_MESH: number;
  destroy: (obj: unknown) => void;
};

let decoderModulePromise: Promise<DracoDecoderModule> | null = null;

async function getDecoderModule(): Promise<DracoDecoderModule> {
  if (!decoderModulePromise) {
    decoderModulePromise = (async () => {
      // The Node build ships as CommonJS and exports a factory.
      const draco3d =
        (await import("draco3d")).default ?? (await import("draco3d"));
      return (draco3d as any).createDecoderModule({});
    })();
  }
  return decoderModulePromise;
}

/**
 * A stand-in for DRACOLoader implementing exactly the surface
 * GLTFLoader uses. `decodeDracoFile`'s signature is fixed by
 * GLTFLoader: (buffer, onLoad, attributeIDs, attributeTypes,
 * colorSpace, onError).
 */
function createNodeDracoLoader() {
  return {
    async preload() {
      await getDecoderModule();
      return this;
    },

    async decodeDracoFile(
      buffer: ArrayBuffer,
      onLoad: (geometry: BufferGeometry) => void,
      attributeIDs: Record<string, number>,
      _attributeTypes: Record<string, string>,
      _colorSpace?: unknown,
      onError?: (err: unknown) => void,
    ) {
      try {
        const module = await getDecoderModule();
        onLoad(decodeToGeometry(module, buffer, attributeIDs));
      } catch (err) {
        if (onError) onError(err);
        else throw err;
      }
    },

    dispose() {},
  };
}

function decodeToGeometry(
  module: DracoDecoderModule,
  buffer: ArrayBuffer,
  attributeIDs: Record<string, number>,
): BufferGeometry {
  const decoder = new module.Decoder();
  const decoderBuffer = new module.DecoderBuffer();
  decoderBuffer.Init(new Int8Array(buffer), buffer.byteLength);

  const mesh = new (module as any).Mesh();
  const status = decoder.DecodeBufferToMesh(decoderBuffer, mesh);
  if (!status.ok() || mesh.ptr === 0) {
    module.destroy(decoderBuffer);
    module.destroy(decoder);
    throw new Error(`Draco decode failed: ${status.error_msg()}`);
  }

  const geometry = new BufferGeometry();

  // Position only — collision reads nothing else, and skipping the
  // other attributes keeps the decode cheap.
  const positionId = attributeIDs.position;
  if (positionId === undefined) {
    module.destroy(mesh);
    module.destroy(decoderBuffer);
    module.destroy(decoder);
    throw new Error("Draco primitive has no position attribute");
  }

  const attribute = decoder.GetAttributeByUniqueId(mesh, positionId);
  const numPoints = mesh.num_points();
  const numComponents = attribute.num_components();
  const numValues = numPoints * numComponents;
  const byteLength = numValues * Float32Array.BYTES_PER_ELEMENT;
  const ptr = (module as any)._malloc(byteLength);
  decoder.GetAttributeDataArrayForAllPoints(
    mesh,
    attribute,
    (module as any).DT_FLOAT32,
    byteLength,
    ptr,
  );
  const positions = new Float32Array(
    (module as any).HEAPF32.buffer,
    ptr,
    numValues,
  ).slice();
  (module as any)._free(ptr);
  geometry.setAttribute(
    "position",
    new BufferAttribute(positions, numComponents),
  );

  // Index buffer.
  const numFaces = mesh.num_faces();
  const indices = new Uint32Array(numFaces * 3);
  const indexPtr = (module as any)._malloc(numFaces * 3 * 4);
  decoder.GetTrianglesUInt32Array(mesh, numFaces * 3 * 4, indexPtr);
  indices.set(
    new Uint32Array((module as any).HEAPU32.buffer, indexPtr, numFaces * 3),
  );
  (module as any)._free(indexPtr);
  geometry.setIndex(new BufferAttribute(indices, 1));

  module.destroy(mesh);
  module.destroy(decoderBuffer);
  module.destroy(decoder);
  return geometry;
}

let loaderPromise: Promise<GLTFLoader> | null = null;

/**
 * A GLTFLoader configured for headless collision loading. Shared, so
 * the Draco WASM module is instantiated once per process.
 */
export async function getNodeGltfLoader(): Promise<GLTFLoader> {
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const loader = new GLTFLoader();
      loader.setDRACOLoader(createNodeDracoLoader() as never);
      // Short-circuit every texture. `_invokeOne` takes the first
      // truthy plugin result, so the image decoder is never reached.
      loader.register(() => ({
        name: "NULL_TEXTURES",
        loadTexture: () => Promise.resolve(new Texture()),
      }));
      return loader;
    })();
  }
  return loaderPromise;
}

const sceneCache = new Map<string, Promise<Group>>();

async function readGlb(source: string): Promise<ArrayBuffer> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch ${source}: ${res.status} ${res.statusText}`,
      );
    }
    return res.arrayBuffer();
  }
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(source);
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

/**
 * Parse a `.glb` from a local path or URL, returning its scene. Cached
 * by source: a map places the same interior many times, and the BVH
 * cache downstream is keyed per geometry, so sharing the loaded scene
 * is both correct and much faster.
 */
export async function loadGlbScene(source: string): Promise<Group> {
  let cached = sceneCache.get(source);
  if (!cached) {
    cached = (async () => {
      const loader = await getNodeGltfLoader();
      const gltf = await loader.parseAsync(await readGlb(source), "");
      log.debug("loaded %s", source);
      return gltf.scene;
    })();
    sceneCache.set(source, cached);
  }
  return cached;
}

/** Meshes of a loaded GLB scene, in traversal order. */
export function glbMeshes(scene: Object3D): Object3D[] {
  const meshes: Object3D[] = [];
  scene.traverse((node) => {
    if ((node as { isMesh?: boolean }).isMesh) meshes.push(node);
  });
  return meshes;
}
