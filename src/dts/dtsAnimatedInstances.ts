import {
  BufferGeometry,
  DataArrayTexture,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  DoubleSide,
  SkinnedMesh,
  Object3D,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
  type Camera,
  Material,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from "three";
import {
  isDTSMesh,
  isDTSMeshBatch,
  type DTSMeshBatch,
  type DTSRenderable,
} from "./dtsModel";
import { DTSInstanceRenderList } from "./dtsInstanceRenderList";
import { DTSInstanceKey } from "./dtsInstanceKey";
import type { RenderItem } from "three/src/renderers/webgl/WebGLRenderLists.js";
import {
  defaultShapeLightUniforms,
  type ShapeLightUniforms,
} from "../shapeLighting";
import { getDTSMaterialMapConfiguration } from "./dtsMaterialMaps";
import { getShapeShaderConfiguration } from "../shapeMaterial";

type ShapeMaterial = MeshBasicMaterial | MeshLambertMaterial;
type Shader = Parameters<Material["onBeforeCompile"]>[0];

type SourceMesh = DTSMeshBatch | DTSRenderable;
type InstanceSource = {
  node: SourceMesh;
  material: ShapeMaterial;
  item: RenderItem;
  key: DTSInstanceKey;
  bucket: SourceBucket;
  arrayTexture: boolean;
};
interface SourceBucket {
  key: number;
  frame: number;
  sources: InstanceSource[];
  pages: Map<number, AnimatedDraw[]>;
  runs: number;
  retired: boolean;
}

/** Shared draw pool for every DTS shape category. Three retains responsibility
 * for culling, LOD, geometry preparation, animation and draw ordering. */
export class DTSAnimatedInstancePool {
  readonly stats = {
    instances: 0,
    draws: 0,
    boneBytes: 0,
    skinLayers: 0,
    candidates: 0,
    nativeDraws: 0,
    registrations: 0,
    membershipChanges: 0,
    attributeBytes: 0,
  };
  enabled = true;
  private buckets = new Map<number, SourceBucket>();
  private activeBuckets: SourceBucket[] = [];
  private registrations = new WeakMap<
    SourceMesh,
    {
      single?: InstanceSource;
      groups: WeakMap<object, InstanceSource>;
    }
  >();
  private frame = 0;
  private readonly maxTextureSize: number;
  private readonly maxLayers: number;
  private readonly lists: DTSInstanceRenderList;
  private collecting = false;
  private revision = 0;
  get root() {
    return this.lists.root;
  }

  private renderer: WebGLRenderer;
  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.maxTextureSize = renderer.capabilities.maxTextureSize;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    this.maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
    this.lists = new DTSInstanceRenderList(renderer, () => this.flush());
  }

  prepare(scene: Scene, camera: Camera): void {
    this.frame++;
    this.revision = ++preparationRevision;
    for (const bucket of this.activeBuckets) bucket.sources.length = 0;
    this.activeBuckets.length = 0;
    for (const key of Object.keys(this.stats) as (keyof typeof this.stats)[])
      this.stats[key] = 0;
    for (const bucket of this.buckets.values())
      for (const pages of bucket.pages.values())
        for (const draw of pages) {
          draw.reset();
          draw.mesh.visible = false;
        }
    this.root.visible =
      this.enabled &&
      !scene.overrideMaterial &&
      this.renderer.sortObjects !== false &&
      !(camera as Camera & { isArrayCamera?: boolean }).isArrayCamera;
    this.collecting = this.root.visible;
    this.lists.prepare(scene);
  }

  private candidate(item: RenderItem): InstanceSource | undefined {
    const node = item.object;
    if (!isDTSMesh(node) && !isDTSMeshBatch(node)) return;
    this.stats.candidates++;
    const signature = materialSignature(
      item.material,
      this.maxTextureSize,
      this.revision,
    );
    if (
      !signature ||
      node.castShadow ||
      node.receiveShadow ||
      node.customDepthMaterial ||
      node.customDistanceMaterial ||
      item.material.onBeforeRender !== Material.prototype.onBeforeRender ||
      node.onBeforeRender !== Object3D.prototype.onBeforeRender ||
      node.onAfterRender !== Object3D.prototype.onAfterRender ||
      (node instanceof SkinnedMesh &&
        node.skeleton.bones.length * 4 > this.maxTextureSize) ||
      !supportsInstanceTransform(node.matrixWorld)
    )
      return;
    let registration = this.registrations.get(node);
    if (!registration) {
      registration = { groups: new WeakMap() };
      this.registrations.set(node, registration);
    }
    const group = item.group as unknown as {
      start: number;
      count: number;
    } | null;
    let source = group ? registration.groups.get(group) : registration.single;
    if (!source) {
      source = {
        node,
        material: item.material as ShapeMaterial,
        item,
        key: new DTSInstanceKey(),
        bucket: undefined!,
        arrayTexture: false,
      };
      if (group) registration.groups.set(group, source);
      else registration.single = source;
      this.stats.registrations++;
    }
    const geometry = node.geometry;
    const key = source.key
      .begin()
      .add("draw")
      .add(geometrySignature(geometry))
      .add(group?.start ?? geometry.drawRange.start)
      .add(group?.count ?? geometry.drawRange.count)
      .add(geometry.drawRange.start)
      .add(geometry.drawRange.count)
      .add(node instanceof SkinnedMesh ? node.skeleton.bones.length : 0)
      .add(node.layers.mask)
      .add(item.groupOrder)
      .add(item.renderOrder)
      .add(signature)
      .end();
    if (source.bucket?.key !== key || source.bucket.retired) {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = {
          key,
          frame: this.frame,
          sources: [],
          pages: new Map(),
          runs: 0,
          retired: false,
        };
        this.buckets.set(key, bucket);
      }
      source.bucket = bucket;
      this.stats.membershipChanges++;
    }
    const bucket = source.bucket;
    if (bucket.frame !== this.frame) {
      bucket.frame = this.frame;
      bucket.sources.length = 0;
      bucket.runs = 0;
    }
    source.material = item.material as ShapeMaterial;
    source.arrayTexture = materialStates.get(item.material)!.arrayTexture;
    source.item = item;
    return source;
  }

  flush(): void {
    if (!this.collecting) return;
    this.collecting = false;
    const list = this.lists.sorted;
    for (const item of list.opaque) {
      const source = this.candidate(item);
      if (!source) continue;
      const bucket = source.bucket;
      if (!bucket.sources.length) this.activeBuckets.push(bucket);
      bucket.sources.push(source);
    }
    for (const bucket of this.activeBuckets) this.batch(bucket, bucket.sources);
    // Transparent membership is stable, but visible runs must follow the camera's
    // depth order, including intervening non-DTS objects.
    let previous: SourceBucket | undefined;
    const run = this.transparentRun;
    run.length = 0;
    const flushRun = () => {
      if (run.length) this.batch(previous!, run, previous!.runs++);
      run.length = 0;
    };
    for (const item of list.transparent) {
      const source = this.candidate(item);
      if (!source || source.bucket !== previous) flushRun();
      if (source) {
        previous = source.bucket;
        run.push(source);
      }
    }
    flushRun();
    this.lists.finish();
    this.stats.nativeDraws = this.stats.candidates - this.stats.instances;
    // Retire inactive registrations in bounded sweeps. Weak source records
    // neither retain despawned meshes nor require React lifecycle bookkeeping.
    if (this.frame % 60 === 0)
      for (const [key, bucket] of this.buckets) {
        if (this.frame - bucket.frame > 600) {
          this.disposeBucket(bucket);
          this.buckets.delete(key);
        } else
          for (const pages of bucket.pages.values())
            for (let i = pages.length - 1; i >= 0; i--)
              if (this.frame - pages[i].lastUsed > 600) {
                pages[i].dispose();
                pages.splice(i, 1);
              }
      }
  }
  private transparentRun: InstanceSource[] = [];

  private batch(bucket: SourceBucket, sources: InstanceSource[], run = 0) {
    if (sources.length < 2) return;
    let pages = bucket.pages.get(run);
    if (!pages) bucket.pages.set(run, (pages = []));
    let offset = 0,
      page = 0;
    while (offset < sources.length) {
      let draw = pages[page++];
      if (!draw) {
        draw = new AnimatedDraw(
          sources[offset],
          this.renderer,
          this.maxTextureSize,
          this.maxLayers,
        );
        pages.push(draw);
        this.root.add(draw.mesh);
      }
      draw.lastUsed = this.frame;
      while (offset < sources.length && draw.add(sources[offset])) offset++;
      // Historical arrays may be full; later pages accept newly encountered skins.
      if (draw.sources.length < 2) continue;
      draw.upload();
      draw.mesh.visible = true;
      this.lists.replace(draw.sources, draw.mesh);
      this.stats.instances += draw.mesh.count;
      this.stats.draws++;
      this.stats.boneBytes += draw.boneBytes;
      this.stats.skinLayers += draw.skinCount;
      this.stats.attributeBytes += draw.attributeBytes;
    }
  }

  private disposeBucket(bucket: SourceBucket): void {
    bucket.retired = true;
    bucket.sources.length = 0;
    for (const pages of bucket.pages.values())
      for (const draw of pages) draw.dispose();
    bucket.pages.clear();
  }

  restore(): void {
    this.collecting = false;
    this.lists.restore();
  }
  dispose(): void {
    this.restore();
    for (const bucket of this.buckets.values()) this.disposeBucket(bucket);
    this.buckets.clear();
    this.activeBuckets.length = 0;
    this.transparentRun.length = 0;
    this.registrations = new WeakMap();
    this.root.removeFromParent();
  }
}

const bufferIds = new WeakMap<object, number>();
let nextBufferId = 0;
function bufferId(value: object | null) {
  if (!value) return 0;
  let id = bufferIds.get(value);
  if (!id) bufferIds.set(value, (id = ++nextBufferId));
  return id;
}
const geometryStates = new WeakMap<BufferGeometry, DTSInstanceKey>();
function geometrySignature(geometry: BufferGeometry): number {
  let key = geometryStates.get(geometry);
  if (!key) geometryStates.set(geometry, (key = new DTSInstanceKey()));
  key.begin().add("geometry").add(bufferId(geometry.index));
  for (const name in geometry.attributes)
    key.add(name).add(bufferId(geometry.attributes[name]));
  key.add("morph");
  for (const name in geometry.morphAttributes) {
    key.add(name);
    for (const attribute of geometry.morphAttributes[
      name as keyof typeof geometry.morphAttributes
    ] ?? [])
      key.add(bufferId(attribute));
  }
  return key.add(geometry.morphTargetsRelative).end();
}
let preparationRevision = 0;

/** Preserve existing scene hooks, including React's rendering loop. */
export function installDTSAnimatedInstances(
  scene: Scene,
  renderer: WebGLRenderer,
) {
  if (installedScenes.has(scene))
    throw new Error("A DTS draw pool is already installed on this scene");
  const pool = new DTSAnimatedInstancePool(renderer);
  installedScenes.add(scene);
  let disposed = false;
  const before = scene.onBeforeRender,
    after = scene.onAfterRender;
  const prepare: Scene["onBeforeRender"] = function (this: Scene, ...args) {
    before.apply(this, args);
    pool.prepare(scene, args[2]);
  };
  const restore: Scene["onAfterRender"] = function (this: Scene, ...args) {
    pool.restore();
    after.apply(this, args);
  };
  scene.add(pool.root);
  scene.onBeforeRender = prepare;
  scene.onAfterRender = restore;
  return {
    pool,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (scene.onBeforeRender === prepare) scene.onBeforeRender = before;
      if (scene.onAfterRender === restore) scene.onAfterRender = after;
      pool.dispose();
      installedScenes.delete(scene);
    },
  };
}
const installedScenes = new WeakSet<Scene>();

class AnimatedDraw {
  mesh: InstancedMesh<BufferGeometry, ShapeMaterial>;
  readonly sources: InstanceSource[] = [];
  readonly boneCount: number;
  lastUsed = 0;
  attributeBytes = 0;
  private attributes: InstancedBufferAttribute[] = [];
  private capacity = 0;
  private boneTexture?: DataTexture;
  private arrayMode = false;
  private uv0!: InstancedBufferAttribute;
  private uv1!: InstancedBufferAttribute;
  private light!: InstancedBufferAttribute;
  private state!: InstancedBufferAttribute;
  private bones = { value: null as DataTexture | null };
  private skins = { value: null as DataArrayTexture | null };
  private skinEntries = new Map<
    Texture["source"],
    { texture: Texture; layer: number; version: number }
  >();
  private skinCapacity = 0;
  private activeSkins = new Set<Texture["source"]>();
  private matrix = new Matrix4();
  private copyPosition = new Vector3();
  private renderer: WebGLRenderer;
  private maxInstances: number;
  private maxLayers: number;
  private template: Texture | null;
  private textureWidth: number;
  private textureHeight: number;

  get skinCount() {
    return this.arrayMode ? this.skinEntries.size : 0;
  }
  get boneBytes() {
    return this.boneTexture?.image.data?.byteLength ?? 0;
  }

  add(source: InstanceSource): boolean {
    if (this.sources.length >= this.maxInstances) return false;
    if (
      source.material.map &&
      source.arrayTexture &&
      !this.reserveSkin(source.material.map)
    )
      return false;
    this.sources.push(source);
    return true;
  }
  reset(): void {
    this.sources.length = 0;
    this.activeSkins.clear();
  }

  constructor(
    source: InstanceSource,
    renderer: WebGLRenderer,
    maxInstances: number,
    maxLayers: number,
  ) {
    const { node, material, item } = source;
    this.renderer = renderer;
    this.maxInstances = maxInstances;
    const image = material.map?.image as
      { width: number; height: number } | undefined;
    this.maxLayers = Math.max(
      1,
      Math.min(
        maxLayers,
        image
          ? Math.floor(
              (64 * 1024 * 1024) / ((image.width * image.height * 4 * 4) / 3),
            )
          : 1,
      ),
    );
    this.template = material.map?.clone() ?? null;
    this.textureWidth = image?.width ?? 0;
    this.textureHeight = image?.height ?? 0;
    this.boneCount =
      node instanceof SkinnedMesh ? node.skeleton.bones.length : 0;
    const geometry = new BufferGeometry();
    geometry.index = node.geometry.index;
    Object.assign(geometry.attributes, node.geometry.attributes);
    geometry.morphAttributes = node.geometry.morphAttributes;
    geometry.morphTargetsRelative = node.geometry.morphTargetsRelative;
    const group = item.group as unknown as {
      start: number;
      count: number;
    } | null;
    const range = node.geometry.drawRange;
    const start = Math.max(range.start, group?.start ?? 0);
    geometry.setDrawRange(
      start,
      Math.max(
        0,
        Math.min(
          range.start + range.count,
          group ? group.start + group.count : Infinity,
        ) - start,
      ),
    );
    // Live material userData includes Texture references used by fade/cloak.
    // Material.copy JSON-serializes it; these uniforms are supplied per instance.
    const pooledMaterial = new (
      material.constructor as typeof MeshBasicMaterial
    )();
    pooledMaterial.copy(
      new Proxy(material, {
        get: (target, key, receiver) =>
          key === "userData" ? {} : Reflect.get(target, key, receiver),
      }),
    );
    pooledMaterial.color.set(0xffffff);
    const before = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    if (this.boneCount)
      pooledMaterial.defines = { ...pooledMaterial.defines, USE_SKINNING: "" };
    pooledMaterial.onBeforeCompile = (shader, renderer) => {
      before.call(pooledMaterial, shader, renderer);
      injectAnimatedInstances(
        shader,
        this.bones,
        this.skins,
        !!this.boneCount,
        this.arrayMode,
      );
    };
    pooledMaterial.customProgramCacheKey = () =>
      `${key}/dts-instances-v2/${this.boneCount > 0}/${this.arrayMode}`;
    this.mesh = new InstancedMesh(geometry, pooledMaterial, 0);
    this.mesh.name = "__dts_animated_draw";
    this.mesh.layers.mask = node.layers.mask;
    this.mesh.renderOrder = node.renderOrder;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false; // Sources have already passed Three's culling.
    this.mesh.raycast = () => {};
    this.resize(Math.min(4, maxInstances));
  }

  private resize(count: number) {
    this.capacity = Math.min(
      this.maxInstances,
      Math.max(count, this.capacity * 2),
    );
    this.boneTexture?.dispose();
    if (this.boneCount)
      this.boneTexture = new DataTexture(
        new Float32Array(this.capacity * this.boneCount * 16),
        this.boneCount * 4,
        this.capacity,
        RGBAFormat,
        FloatType,
      );
    this.bones.value = this.boneTexture ?? null;
    // Native disposal frees the old instanceMatrix buffer when the pool grows.
    this.mesh.dispose();
    this.mesh.morphTexture?.dispose();
    this.mesh.morphTexture = null;
    this.disposeInstanceAttributes();
    this.mesh.instanceMatrix = new InstancedBufferAttribute(
      new Float32Array(this.capacity * 16),
      16,
    ).setUsage(DynamicDrawUsage);
    this.light = new InstancedBufferAttribute(
      new Float32Array(this.capacity * 4),
      4,
    ).setUsage(DynamicDrawUsage);
    this.state = new InstancedBufferAttribute(
      new Float32Array(this.capacity * 4),
      4,
    ).setUsage(DynamicDrawUsage);
    this.uv0 = new InstancedBufferAttribute(
      new Float32Array(this.capacity * 3),
      3,
    ).setUsage(DynamicDrawUsage);
    this.uv1 = new InstancedBufferAttribute(
      new Float32Array(this.capacity * 3),
      3,
    ).setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(
      new Float32Array(this.capacity * 3),
      3,
    ).setUsage(DynamicDrawUsage);
    this.mesh.geometry.setAttribute("dtsInstanceUV0", this.uv0);
    this.mesh.geometry.setAttribute("dtsInstanceUV1", this.uv1);
    this.mesh.geometry.setAttribute("dtsInstanceLight", this.light);
    this.mesh.geometry.setAttribute("dtsInstanceState", this.state);
    this.attributes = [
      this.mesh.instanceMatrix,
      this.light,
      this.state,
      this.uv0,
      this.uv1,
      this.mesh.instanceColor!,
    ];
  }

  private reserveSkin(map: Texture) {
    let entry = this.skinEntries.get(map.source);
    if (!entry) {
      if (this.skinEntries.size >= this.maxLayers) return undefined;
      entry = { texture: map, layer: this.skinEntries.size, version: -1 };
      this.skinEntries.set(map.source, entry);
    }
    // A live material can switch Source during reskinning. Keep a sampler
    // which still points at this entry's Source, and upload only active skins.
    entry.texture = map;
    this.activeSkins.add(map.source);
    return entry;
  }

  private updateSkins(): void {
    if (this.skinEntries.size > this.skinCapacity) {
      this.skinCapacity = Math.min(
        this.maxLayers,
        Math.max(this.skinEntries.size, 4, this.skinCapacity * 2),
      );
      this.skins.value?.dispose();
      const t = this.template!;
      const array = new DataArrayTexture(
        null,
        this.textureWidth,
        this.textureHeight,
        this.skinCapacity,
      );
      array.colorSpace = t.colorSpace;
      array.wrapS = t.wrapS;
      array.wrapT = t.wrapT;
      array.magFilter = t.magFilter;
      array.minFilter = t.minFilter;
      array.anisotropy = t.anisotropy;
      array.generateMipmaps = t.generateMipmaps;
      array.source.dataReady = false; // Allocate storage; GPU copies fill it.
      array.needsUpdate = true;
      this.renderer.initTexture(array);
      this.skins.value = array;
      for (const existing of this.skinEntries.values()) existing.version = -1;
    }
    // Native GPU texture copies preserve RGB under zero alpha, which a canvas
    // readback would destroy. No image resampling or CPU pixel/mipmap copies.
    for (const [source, existing] of this.skinEntries) {
      if (!this.activeSkins.has(source)) continue;
      if (existing.version === existing.texture.source.version) continue;
      this.renderer.initTexture(existing.texture);
      this.copyPosition.set(0, 0, existing.layer);
      this.renderer.copyTextureToTexture(
        existing.texture,
        this.skins.value!,
        null,
        this.copyPosition,
      );
      existing.version = existing.texture.source.version;
    }
  }

  upload(): void {
    if (this.sources.length > this.capacity) this.resize(this.sources.length);
    if (this.activeSkins.size > 1 && !this.arrayMode) {
      this.arrayMode = true;
      this.mesh.material.needsUpdate = true;
    }
    this.mesh.material.map = this.sources[0].material.map;
    if (this.arrayMode) this.updateSkins();
    this.mesh.count = this.capacity;
    const data = this.boneTexture?.image.data;
    let bonesChanged = false;
    for (const attribute of this.attributes) attribute.clearUpdateRanges();
    for (let index = 0; index < this.sources.length; index++) {
      const source = this.sources[index];
      const { node, material } = source;
      const layer = this.arrayMode
        ? this.skinEntries.get(material.map!.source)!.layer
        : 0;
      if (
        writeFloats(
          this.mesh.instanceMatrix.array as Float32Array,
          index * 16,
          node.matrixWorld.elements,
        )
      )
        this.mesh.instanceMatrix.addUpdateRange(index * 16, 16);
      writeInstance(
        this.mesh.instanceColor!,
        index,
        material.color.r,
        material.color.g,
        material.color.b,
      );
      if (node.morphTargetInfluences?.length) this.mesh.setMorphAt(index, node);
      const uv = material.map?.matrix.elements ?? identityUV;
      writeInstance(this.uv0, index, uv[0], uv[3], uv[6]);
      writeInstance(this.uv1, index, uv[1], uv[4], uv[7]);
      if (node instanceof SkinnedMesh) {
        const { skeleton } = node;
        for (let bone = 0; bone < this.boneCount; bone++) {
          this.matrix
            .multiplyMatrices(
              skeleton.bones[bone].matrixWorld,
              skeleton.boneInverses[bone],
            )
            .premultiply(node.bindMatrixInverse)
            .multiply(node.bindMatrix);
          bonesChanged =
            writeFloats(
              data! as Float32Array,
              (index * this.boneCount + bone) * 16,
              this.matrix.elements,
            ) || bonesChanged;
        }
      }
      const light =
        (material.userData.shapeLight as ShapeLightUniforms | undefined) ??
        defaultShapeLightUniforms;
      const color = light.shapeLightColor.value;
      writeInstance(
        this.light,
        index,
        color.r,
        color.g,
        color.b,
        light.shapeLightMode.value,
      );
      writeInstance(
        this.state,
        index,
        light.shapeBoundRadius.value,
        layer,
        material.opacity,
        0,
      );
    }
    this.mesh.count = this.sources.length;
    if (this.boneTexture && bonesChanged) this.boneTexture.needsUpdate = true;
    if (this.mesh.morphTexture) this.mesh.morphTexture.needsUpdate = true;
    this.attributeBytes = 0;
    for (const attribute of this.attributes) {
      if (!attribute.updateRanges.length) continue;
      for (const range of attribute.updateRanges)
        this.attributeBytes += range.count * 4;
      attribute.needsUpdate = true;
    }
  }

  private disposeInstanceAttributes(): void {
    if (!this.light) return;
    // Geometry disposal must not delete cache-owned vertex/index buffers.
    const geometry = this.mesh.geometry;
    const attributes = geometry.attributes,
      index = geometry.index;
    geometry.index = null;
    geometry.attributes = {
      dtsInstanceLight: this.light,
      dtsInstanceState: this.state,
      dtsInstanceUV0: this.uv0,
      dtsInstanceUV1: this.uv1,
    };
    const morphAttributes = geometry.morphAttributes;
    geometry.morphAttributes = {};
    geometry.dispose();
    geometry.morphAttributes = morphAttributes;
    geometry.attributes = attributes;
    geometry.index = index;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.disposeInstanceAttributes();
    this.mesh.material.dispose();
    this.boneTexture?.dispose();
    this.skins.value?.dispose();
    this.skinEntries.clear();
  }
}

const identityUV = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Compare in the GPU buffer's precision so steady doubles do not trigger
 * redundant uploads. Three merges adjacent update ranges before uploading. */
function writeFloats(
  target: Float32Array,
  offset: number,
  values: ArrayLike<number>,
): boolean {
  let changed = false;
  for (let i = 0; i < values.length; i++) {
    const value = Math.fround(values[i]);
    if (target[offset + i] !== value) {
      target[offset + i] = value;
      changed = true;
    }
  }
  return changed;
}
function writeInstance(
  attribute: InstancedBufferAttribute,
  index: number,
  x: number,
  y: number,
  z: number,
  w = 0,
): void {
  x = Math.fround(x);
  y = Math.fround(y);
  z = Math.fround(z);
  w = Math.fround(w);
  if (
    attribute.getX(index) === x &&
    attribute.getY(index) === y &&
    attribute.getZ(index) === z &&
    (attribute.itemSize === 3 || attribute.getW(index) === w)
  )
    return;
  if (attribute.itemSize === 3) attribute.setXYZ(index, x, y, z);
  else attribute.setXYZW(index, x, y, z, w);
  attribute.addUpdateRange(index * attribute.itemSize, attribute.itemSize);
}

interface CachedSignature {
  snapshot: DTSInstanceKey;
  revision: number;
  key: number | null;
}
interface TextureState {
  revision: number;
  width?: number;
  height?: number;
  arrayTexture: boolean;
  variants: CachedSignature[];
}
const textureStates = new WeakMap<Texture, TextureState>();

function readTexture(map: Texture, revision: number): TextureState {
  let state = textureStates.get(map);
  if (!state)
    textureStates.set(
      map,
      (state = { revision: -1, arrayTexture: false, variants: [] }),
    );
  if (state.revision === revision) return state;
  state.revision = revision;
  const image = map.image as { width?: number; height?: number } | undefined;
  const width = (state.width = image?.width);
  const height = (state.height = image?.height);
  state.arrayTexture =
    !!width &&
    !!height &&
    (width * height * 4 * 4) / 3 <= 64 * 1024 * 1024 &&
    map.format === RGBAFormat &&
    map.type === UnsignedByteType &&
    !map.flipY &&
    !map.premultiplyAlpha &&
    !map.mipmaps.length &&
    !map.isRenderTargetTexture &&
    map.channel === 0;
  if (map.matrixAutoUpdate) map.updateMatrix();
  return state;
}
function textureSignature(
  map: Texture | null,
  array: boolean,
  revision: number,
  perInstanceUV = false,
): number | null {
  if (!map) return null;
  const state = readTexture(map, revision);
  const { variants } = state;
  const variant = Number(array) * 2 + Number(perInstanceUV);
  const cached = (variants[variant] ??= {
    snapshot: new DTSInstanceKey(),
    revision: -1,
    key: null,
  });
  if (cached.revision === revision) return cached.key;
  cached.revision = revision;
  const key = cached.snapshot
    .begin()
    .add("texture")
    .add(array ? 0 : bufferId(map.source))
    .add(state.width)
    .add(state.height);
  for (const field of textureFields) key.add(map[field]);
  if (!perInstanceUV) for (const value of map.matrix.elements) key.add(value);
  return (cached.key = key.end());
}
const textureFields = [
  "mapping",
  "channel",
  "format",
  "type",
  "colorSpace",
  "minFilter",
  "magFilter",
  "wrapS",
  "wrapT",
  "anisotropy",
  "generateMipmaps",
  "flipY",
  "premultiplyAlpha",
  "unpackAlignment",
] as const;
const materialFields = [
  "type",
  "transparent",
  "blending",
  "blendSrc",
  "blendDst",
  "blendEquation",
  "blendSrcAlpha",
  "blendDstAlpha",
  "blendEquationAlpha",
  "blendAlpha",
  "premultipliedAlpha",
  "side",
  "alphaTest",
  "alphaHash",
  "alphaToCoverage",
  "forceSinglePass",
  "vertexColors",
  "fog",
  "depthTest",
  "depthWrite",
  "depthFunc",
  "colorWrite",
  "polygonOffset",
  "polygonOffsetFactor",
  "polygonOffsetUnits",
  "toneMapped",
  "wireframe",
  "wireframeLinewidth",
  "reflectivity",
  "refractionRatio",
  "combine",
  "aoMapIntensity",
  "lightMapIntensity",
] as const;
const extraMaps = [
  "alphaMap",
  "aoMap",
  "lightMap",
  "specularMap",
  "envMap",
] as const;
const lambertMaps = ["bumpMap", "normalMap", "emissiveMap"] as const;
const materialStates = new WeakMap<
  Material,
  CachedSignature & { arrayTexture: boolean }
>();

function materialSignature(
  material: Material,
  maxTextureSize: number,
  revision: number,
): number | null {
  let cached = materialStates.get(material);
  if (!cached)
    materialStates.set(
      material,
      (cached = {
        snapshot: new DTSInstanceKey(),
        revision: -1,
        key: null,
        arrayTexture: false,
      }),
    );
  if (cached.revision === revision) return cached.key;
  cached.revision = revision;
  const detail = getDTSMaterialMapConfiguration(material);
  if (
    !(
      material instanceof MeshLambertMaterial ||
      material instanceof MeshBasicMaterial
    ) ||
    !material.visible ||
    material.clippingPlanes?.length ||
    material.stencilWrite ||
    (material.transparent &&
      material.side === DoubleSide &&
      !material.forceSinglePass) ||
    (getShapeShaderConfiguration(material, detail?.before) === undefined &&
      material.onBeforeCompile !== Material.prototype.onBeforeCompile) ||
    (material.map && !material.map.image)
  )
    return (cached.key = null);
  const key = cached.snapshot
    .begin()
    .add("material")
    .add(material.customProgramCacheKey())
    .add(getShapeShaderConfiguration(material, detail?.before))
    .add(textureSignature(detail?.maps.detailMap ?? null, false, revision))
    .add(detail?.maps.detailScale);
  if (material instanceof MeshLambertMaterial) {
    const { emissive, normalScale } = material;
    key
      .add(emissive.r)
      .add(emissive.g)
      .add(emissive.b)
      .add(material.emissiveIntensity)
      .add(material.bumpScale)
      .add(normalScale.x)
      .add(normalScale.y)
      .add(material.flatShading);
  }
  for (const field of materialFields) key.add(material[field]);
  key
    .add(material.blendColor.r)
    .add(material.blendColor.g)
    .add(material.blendColor.b);
  const texture = material.map
    ? readTexture(material.map, revision)
    : undefined;
  cached.arrayTexture =
    !!texture?.arrayTexture &&
    texture.width! <= maxTextureSize &&
    texture.height! <= maxTextureSize;
  key.add(textureSignature(material.map, cached.arrayTexture, revision, true));
  for (const field of extraMaps)
    key.add(textureSignature(material[field], false, revision));
  if (material instanceof MeshLambertMaterial)
    for (const field of lambertMaps)
      key.add(textureSignature(material[field], false, revision));
  return (cached.key = key.end());
}

/** Three's instance normal transform supports TRS, but not shear/reflection. */
function supportsInstanceTransform(matrix: Matrix4) {
  const e = matrix.elements;
  const xx = e[0] ** 2 + e[1] ** 2 + e[2] ** 2;
  const yy = e[4] ** 2 + e[5] ** 2 + e[6] ** 2;
  const zz = e[8] ** 2 + e[9] ** 2 + e[10] ** 2;
  return (
    matrix.determinant() > 0 &&
    Math.abs(e[0] * e[4] + e[1] * e[5] + e[2] * e[6]) <
      1e-6 * Math.sqrt(xx * yy) &&
    Math.abs(e[0] * e[8] + e[1] * e[9] + e[2] * e[10]) <
      1e-6 * Math.sqrt(xx * zz) &&
    Math.abs(e[4] * e[8] + e[5] * e[9] + e[6] * e[10]) <
      1e-6 * Math.sqrt(yy * zz)
  );
}

function injectAnimatedInstances(
  shader: Shader,
  bones: { value: DataTexture | null },
  skins: { value: DataArrayTexture | null },
  skinned: boolean,
  array: boolean,
) {
  shader.uniforms.boneTexture = bones;
  shader.uniforms.bindMatrix = { value: new Matrix4() };
  shader.uniforms.bindMatrixInverse = { value: new Matrix4() };
  shader.uniforms.dtsSkinArray = skins;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
    attribute vec4 dtsInstanceLight;
    attribute vec4 dtsInstanceState;`,
    )
    .replace(
      "uniform int shapeLightMode;",
      "#define shapeLightMode int(dtsInstanceLight.w + 0.5)",
    )
    .replace(
      "uniform vec3 shapeLightColor;",
      "#define shapeLightColor dtsInstanceLight.rgb",
    )
    .replace(
      "uniform float shapeBoundRadius;",
      "#define shapeBoundRadius dtsInstanceState.x",
    )
    .replace(
      "#include <skinning_pars_vertex>",
      `
    ${
      skinned
        ? `uniform mat4 bindMatrix;
    uniform mat4 bindMatrixInverse;
    uniform highp sampler2D boneTexture;
    mat4 getBoneMatrix(const in float i) {
      int x = int(i) * 4;
      int y = gl_InstanceID;
      return mat4(texelFetch(boneTexture, ivec2(x, y), 0),
        texelFetch(boneTexture, ivec2(x+1, y), 0),
        texelFetch(boneTexture, ivec2(x+2, y), 0),
        texelFetch(boneTexture, ivec2(x+3, y), 0));
    }`
        : ""
    }
    attribute vec3 dtsInstanceUV0;
    attribute vec3 dtsInstanceUV1;
    varying vec4 vDtsInstanceState;
  `,
    )
    .replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
    vDtsInstanceState = dtsInstanceState;
    #ifdef USE_MAP
      vMapUv = vec2(dot(dtsInstanceUV0, vec3(MAP_UV, 1.0)), dot(dtsInstanceUV1, vec3(MAP_UV, 1.0)));
    #endif
  `,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
    uniform highp sampler2DArray dtsSkinArray;
    varying vec4 vDtsInstanceState;
  `,
    )
    .replace("uniform float opacity;", "#define opacity vDtsInstanceState.z");
  if (array)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <map_fragment>",
        "diffuseColor *= texture(dtsSkinArray, vec3(vMapUv, vDtsInstanceState.y));",
      )
      .replaceAll(
        "texture2D(map, vMapUv)",
        "texture(dtsSkinArray, vec3(vMapUv, vDtsInstanceState.y))",
      );
}
