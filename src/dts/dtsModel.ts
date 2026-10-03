import {
  AdditiveBlending,
  AnimationClip,
  Bone,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Camera,
  FrontSide,
  type Frustum,
  Group,
  LOD,
  Material,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  NormalBlending,
  NoColorSpace,
  Object3D,
  Quaternion,
  type Raycaster,
  type Intersection,
  SkinnedMesh,
  Skeleton,
  SRGBColorSpace,
  SubtractiveBlending,
  Texture,
  Vector3,
} from "three";
import {
  dtsVector,
  DTS_BASIS,
  shareDTSGeometry,
  type DTSGeometryFrames,
} from "./dtsGeometry";
import { applyDTSMaterialMaps } from "./dtsMaterialMaps";
import { DTSHierarchy } from "./dtsHierarchy";
import { intersectsDTSSkinFrustum } from "./dtsSkinBounds";
import { isDTSImpostor } from "./dtsImpostor";
import {
  configureDTSImageTexture,
  getDTSImageFrame,
  type DTSImageAnimation,
} from "./dtsTextures";
import {
  DTSMaterialFlags,
  type DTSMaterialData,
  type DTSMeshData,
  type DTSSequence,
  type DTSShapeData,
  type DTSTrigger,
} from "./dtsTypes";

export class DTSMaterial extends MeshLambertMaterial {
  readonly isDTSMaterial = true;
  source?: DTSMaterialData;
  detailMap: Texture | null = null;
  detailScale = 1;
  get resourcePath(): string | undefined {
    return this.source?.name.replace(/\\/g, "/");
  }
  get flagNames(): Set<string> {
    return new Set(
      Object.entries(DTSMaterialFlags)
        .filter(([, bit]) => ((this.source?.flags ?? 0) & bit) !== 0)
        .map(([name]) => name),
    );
  }
  override copy(source: this): this {
    super.copy(source);
    this.source = source.source;
    this.detailMap = source.detailMap;
    this.detailScale = source.detailScale;
    applyDTSMaterialMaps(this, this);
    return this;
  }
}

export function createDTSMaterial(
  source: DTSMaterialData,
  map: Texture | null = null,
): DTSMaterial {
  const material = new DTSMaterial();
  material.source = source;
  material.name = source.name;
  material.map = map;
  const flags = source.flags;
  material.transparent = !!(
    flags &
    (DTSMaterialFlags.Translucent |
      DTSMaterialFlags.Additive |
      DTSMaterialFlags.Subtractive)
  );
  material.depthWrite = !material.transparent;
  material.side = FrontSide;
  material.blending =
    flags & DTSMaterialFlags.Additive
      ? AdditiveBlending
      : flags & DTSMaterialFlags.Subtractive
        ? SubtractiveBlending
        : NormalBlending;
  if (
    flags &
    (DTSMaterialFlags.SelfIlluminating |
      DTSMaterialFlags.Additive |
      DTSMaterialFlags.Subtractive)
  ) {
    material.emissive.set(0xffffff);
    material.emissiveMap = map;
    material.color.set(0);
  }
  material.reflectivity =
    flags & DTSMaterialFlags.NeverEnvMap ? 0 : source.reflectionAmount;
  if (map) {
    configureDTSImageTexture(map, flags);
    map.colorSpace =
      flags &
      (DTSMaterialFlags.BumpMapOnly | DTSMaterialFlags.ReflectanceMapOnly)
        ? NoColorSpace
        : SRGBColorSpace;
  }
  return material;
}

export interface DTSMeshBinding {
  source: DTSMeshData;
  frames: DTSGeometryFrames;
  objectIndex: number;
  detailIndices: number[];
  materialIndex: number;
  /** A decal addresses vertices on its target object. */
  decalIndex?: number;
}

interface NativeMesh {
  binding?: DTSMeshBinding;
}
export class DTSMesh extends Mesh implements NativeMesh {
  ownsGeometry = false;
  private geometrySource?: Pick<BufferGeometry, "attributes" | "index">;
  private unprocessedGeometry?: BufferGeometry;
  private geometryProcessor?: (source: BufferGeometry) => BufferGeometry;
  readonly isDTSMesh = true;
  binding?: DTSMeshBinding;
  override copy(source: this, recursive = true): this {
    super.copy(source, recursive);
    this.binding = source.binding;
    this.material = Array.isArray(source.material)
      ? source.material.map(cloneMaterial)
      : cloneMaterial(source.material);
    this.ownsGeometry = false;
    this.geometrySource = undefined;
    this.unprocessedGeometry = undefined;
    this.geometryProcessor = undefined;
    // Processors are instance effects. A clone starts from the native surface,
    // not a transient expanded topology that DTS cannot update directly.
    if (source.unprocessedGeometry) {
      this.geometry = source.unprocessedGeometry;
      this.morphTargetInfluences = undefined;
      this.morphTargetDictionary = undefined;
      this.updateMorphTargets();
    }
    return this;
  }
  /** Process the current native surface after LOD merging and decal updates.
   * The processor owns its output; DTS continues to own only the input. */
  setGeometryProcessor(processor?: (source: BufferGeometry) => BufferGeometry) {
    this.restoreNativeGeometry();
    if (processor) this.prepareGeometry();
    this.geometryProcessor = processor;
    this.unprocessedGeometry = processor ? this.geometry : undefined;
    this.refreshProcessedGeometry();
  }
  restoreNativeGeometry(): void {
    if (this.unprocessedGeometry) this.geometry = this.unprocessedGeometry;
  }
  refreshProcessedGeometry(): void {
    if (this.geometryProcessor && this.unprocessedGeometry)
      this.geometry = this.geometryProcessor(this.unprocessedGeometry);
  }
  override raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    if (this.parent instanceof DTSDetail && this.parent.batched)
      this.parent.updateWorldMatrix(true, true, true);
    super.raycast(raycaster, intersects);
  }
  /** Allocate mutable geometry only when this instance actually uses the LOD. */
  prepareGeometry(): void {
    if (!this.ownsGeometry) {
      const source = this.geometry;
      this.geometrySource = {
        attributes: { ...source.attributes },
        index: source.index,
      };
      this.geometry = shareDTSGeometry(source);
      this.ownsGeometry = true;
      if (this.binding!.decalIndex !== undefined)
        this.geometry.setIndex(source.index?.clone() ?? null);
      if (this.binding!.decalIndex !== undefined)
        this.geometry.setAttribute("uv", source.getAttribute("uv").clone());
      if (this.binding!.source.skin) {
        this.geometry.setAttribute(
          "position",
          source.getAttribute("position").clone(),
        );
        this.geometry.setAttribute(
          "normal",
          source.getAttribute("normal").clone(),
        );
      }
    }
  }
  /** Three disposes every attached attribute buffer, even shared attributes.
   * Detach cache-owned buffers so despawning a shape cannot evict other clones. */
  disposeGeometry(): void {
    if (!this.ownsGeometry) return;
    const geometry = this.unprocessedGeometry ?? this.geometry;
    const attributes = geometry.attributes,
      index = geometry.index,
      morphAttributes = geometry.morphAttributes;
    const shared = new Set(Object.values(this.geometrySource!.attributes));
    if (this.binding)
      for (const frames of [
        this.binding.frames.positions,
        this.binding.frames.normals,
        this.binding.frames.uv,
        this.binding.frames.uv1,
        this.binding.frames.colors,
      ])
        for (const attribute of frames) shared.add(attribute);
    geometry.attributes = Object.fromEntries(
      Object.entries(attributes).filter(
        ([, attribute]) => !shared.has(attribute),
      ),
    );
    if (
      index === this.geometrySource!.index ||
      (index && sharedSortedIndices.has(index))
    )
      geometry.setIndex(null);
    geometry.morphAttributes = {};
    try {
      geometry.dispose();
    } finally {
      // React StrictMode can reuse this scene after effect cleanup. Restore
      // its CPU descriptors; Three recreates only the released GPU resources.
      geometry.attributes = attributes;
      geometry.setIndex(index);
      geometry.morphAttributes = morphAttributes;
    }
  }
}
export class DTSSkinnedMesh extends SkinnedMesh implements NativeMesh {
  readonly isDTSMesh = true;
  binding?: DTSMeshBinding;
  override copy(source: this, recursive = true): this {
    super.copy(source, recursive);
    this.binding = source.binding;
    this.material = Array.isArray(source.material)
      ? source.material.map(cloneMaterial)
      : cloneMaterial(source.material);
    return this;
  }
}
export type DTSRenderable = DTSMesh | DTSSkinnedMesh;
export function isDTSMesh(object: Object3D): object is DTSRenderable {
  return (object as DTSMesh).isDTSMesh === true;
}

/** Internal pose helpers are driven by native PropertyBindings, which mark
 * matrixWorldNeedsUpdate when a track writes TRS. Resting helpers stay fixed. */
export class DTSAnimationTransform extends Bone {
  constructor() {
    super();
    this.matrixAutoUpdate = false;
    this.matrixWorldNeedsUpdate = true;
  }
  override updateMatrixWorld(force?: boolean): void {
    if (!this.matrixAutoUpdate && this.matrixWorldNeedsUpdate)
      this.updateMatrix();
    super.updateMatrixWorld(force);
  }
  override updateWorldMatrix(
    parents: boolean,
    children: boolean,
    force = false,
  ): void {
    if (!this.matrixAutoUpdate && this.matrixWorldNeedsUpdate)
      this.updateMatrix();
    // A mount/collision query may update our parent before the render traversal.
    super.updateWorldMatrix(parents, children, force || parents);
  }
}

/** Public named bones stay editable independently of the internal base,
 * blend and arbitrary-scale helpers above them. */
export class DTSNode extends Bone {
  readonly isDTSNode = true;
  nodeIndex = -1;
  override updateMatrixWorld(force?: boolean): void {
    if (!updateIdentityMatrixWorld(this)) super.updateMatrixWorld(force);
  }
  override copy(source: this, recursive = true): this {
    super.copy(source, recursive);
    this.nodeIndex = source.nodeIndex;
    return this;
  }
}

/** LOD branches contain meshes only. Hidden branches need no world matrices;
 * DTSShape refreshes a newly selected branch before the renderer visits it. */
export class DTSDetail extends Group {
  /** The owning shape can render rigid parts through a shared skinned draw. */
  batched = false;
  constructor() {
    super();
    this.matrixAutoUpdate = false;
  }
  override updateMatrixWorld(force?: boolean): void {
    if (this.visible) super.updateMatrixWorld(force);
  }
  override raycast(): boolean {
    // Three's raycaster traverses invisible objects unless told to stop.
    return this.visible || this.batched;
  }
}

/** Shared lazy visual resource. The template is compiled once, on first use;
 * raw DTS data remains available independently for collision and animation. */
export interface DTSBranch {
  objectIndex: number;
  detailIndices: readonly number[];
  decalIndex?: number;
  create(): DTSDetail;
}

/** A conventional one-bone-per-vertex skin, retaining the authored meshes for
 * decals, raycasts and states that require separate draw calls. */
export class DTSRigidMeshBatch extends SkinnedMesh {
  bindings: readonly DTSMeshBinding[] = [];
  private batchState = new DTSMeshBatchState();
  override intersectsFrustum(frustum: Frustum): boolean {
    return intersectsDTSSkinFrustum(this, frustum);
  }
  override copy(source: this, recursive = true): this {
    super.copy(source, recursive);
    this.bindings = source.bindings;
    this.material = Array.isArray(source.material)
      ? source.material.map(cloneMaterial)
      : cloneMaterial(source.material);
    this.batchState = new DTSMeshBatchState();
    return this;
  }
  initialize(
    meshes: Map<DTSMeshBinding, DTSRenderable>,
    objects: Map<number, DTSObject>,
  ): void {
    this.batchState.initialize(this.bindings, meshes, objects);
  }
  updateBatch(shape: DTSShape, detail: number): void {
    this.batchState.update(this, shape, detail);
  }
  override raycast(): void {
    /* Authored child meshes handle ray intersections, without duplicate hits. */
  }
}

/** Parts without relative motion use ordinary merged geometry, with no skin
 * attributes, bone palette or per-vertex skinning work. */
export class DTSStaticMeshBatch extends Mesh {
  bindings: readonly DTSMeshBinding[] = [];
  restTransforms: readonly Matrix4[] = [];
  private batchState = new DTSMeshBatchState();
  override copy(source: this, recursive = true): this {
    super.copy(source, recursive);
    this.bindings = source.bindings;
    this.restTransforms = source.restTransforms;
    this.material = Array.isArray(source.material)
      ? source.material.map(cloneMaterial)
      : cloneMaterial(source.material);
    this.batchState = new DTSMeshBatchState();
    return this;
  }
  initialize(
    meshes: Map<DTSMeshBinding, DTSRenderable>,
    objects: Map<number, DTSObject>,
  ): void {
    this.batchState.initialize(this.bindings, meshes, objects);
  }
  updateBatch(shape: DTSShape, detail: number): void {
    this.batchState.update(this, shape, detail, this.restTransforms);
  }
  override raycast(): void {
    /* Authored child meshes handle ray intersections, without duplicate hits. */
  }
}

export type DTSMeshBatch = DTSRigidMeshBatch | DTSStaticMeshBatch;
export function isDTSMeshBatch(node: Object3D): node is DTSMeshBatch {
  return (
    node instanceof DTSRigidMeshBatch || node instanceof DTSStaticMeshBatch
  );
}

class DTSMeshBatchState {
  private parts: DTSRenderable[] = [];
  private owners: DTSObject[] = [];
  initialize(
    bindings: readonly DTSMeshBinding[],
    meshes: Map<DTSMeshBinding, DTSRenderable>,
    objects: Map<number, DTSObject>,
  ): void {
    this.parts = bindings.map((binding) => meshes.get(binding)!);
    this.owners = bindings.map((binding) => objects.get(binding.objectIndex)!);
  }
  update(
    batch: DTSMeshBatch,
    shape: DTSShape,
    detail: number,
    restTransforms?: readonly Matrix4[],
  ): void {
    // Fading parts need their own transparency sorting. Vertex-frame animation,
    // sorted meshes and scaled bones are excluded when building the batch.
    const material = batch.material as Material;
    let active =
      shape.intraDetailLevel === 1 &&
      batch.bindings[0].detailIndices.includes(detail) &&
      (shape.ignoreDetailSize || shape.data.details[detail]?.size >= 0) &&
      !material.transparent;
    for (let i = 0; active && i < this.parts.length; i++) {
      const part = this.parts[i],
        owner = this.owners[i];
      active = part.visible && owner.opacity === 1;
      for (
        let node: Object3D | null = owner;
        active && node !== shape;
        node = node!.parent
      )
        active = !!node?.visible;
      if (active && restTransforms) {
        // A host may move a node directly even without an authored sequence.
        // Restore the original draws if the baked transform no longer applies.
        batchExpectedMatrix.multiplyMatrices(
          shape.matrixWorld,
          restTransforms[i],
        );
        for (let j = 0; active && j < 16; j++)
          active =
            Math.abs(
              batchExpectedMatrix.elements[j] - owner.matrixWorld.elements[j],
            ) < 1e-7;
      }
    }
    batch.visible = active;
    for (const part of this.parts) (part.parent as DTSDetail).batched = active;
  }
}
const batchExpectedMatrix = new Matrix4();

/** Object state is animated by standard NumberKeyframeTracks. */
export class DTSObject extends Group {
  readonly isDTSObject = true;
  objectIndex = -1;
  frame = 0;
  materialFrame = 0;
  defaultVisibility = 1;
  private visibilityValue = 1;
  get opacity() {
    return this.visibilityValue;
  }
  set opacity(value: number) {
    this.visibilityValue = value;
    this.visible = value > 0.01;
    this.traverse((node) => {
      if (isDTSMesh(node)) this.applyMeshOpacity(node);
    });
  }
  /** Initialize a newly realized part without touching existing faded materials. */
  applyMeshOpacity(node: DTSRenderable): void {
    const value = this.opacity;
    const materials = Array.isArray(node.material)
      ? node.material
      : [node.material];
    for (const material of materials) {
      const original = originalMaterialState(material);
      material.opacity = value;
      const transparent = original.transparent || value < 0.99;
      if (material.transparent !== transparent) material.needsUpdate = true;
      material.transparent = transparent;
      material.depthWrite = original.depthWrite && value >= 0.99;
      material.alphaTest = value < 0.99 ? 0 : original.alphaTest;
    }
  }
  override copy(source: this, recursive = true): this {
    super.copy(source, recursive);
    this.objectIndex = source.objectIndex;
    this.frame = source.frame;
    this.materialFrame = source.materialFrame;
    this.defaultVisibility = source.defaultVisibility;
    this.visibilityValue = source.visibilityValue;
    return this;
  }
  override updateMatrixWorld(force?: boolean): void {
    if (this.visible && !updateIdentityMatrixWorld(this))
      super.updateMatrixWorld(force);
  }
}
/** Most public bones and object controls add no transform of their own. Keep
 * their world matrices and descendants current without composing/multiplying
 * identity matrices. Edited controls retain Three's normal update path. */
function updateIdentityMatrixWorld(object: Object3D): boolean {
  const { position, quaternion, scale } = object;
  if (
    !object.matrixAutoUpdate ||
    !object.matrixWorldAutoUpdate ||
    object.pivot !== null ||
    object.updateMatrix !== Object3D.prototype.updateMatrix ||
    position.x !== 0 ||
    position.y !== 0 ||
    position.z !== 0 ||
    quaternion.x !== 0 ||
    quaternion.y !== 0 ||
    quaternion.z !== 0 ||
    quaternion.w !== 1 ||
    scale.x !== 1 ||
    scale.y !== 1 ||
    scale.z !== 1
  )
    return false;
  object.matrix.identity();
  object.matrixWorld.copy(object.parent?.matrixWorld ?? object.matrix);
  object.matrixWorldNeedsUpdate = false;
  // matrixAutoUpdate normally propagates force, including identity → edited
  // → identity transitions and children mounted since the previous update.
  for (let i = 0, n = object.children.length; i < n; i++)
    object.children[i].updateMatrixWorld(true);
  return true;
}
const materialStates = new WeakMap<
  Material,
  { transparent: boolean; depthWrite: boolean; alphaTest: number }
>();
function cloneMaterial<T extends Material>(source: T): T {
  const material = source.clone();
  const original = materialStates.get(source);
  if (original) materialStates.set(material, original);
  return material;
}
function originalMaterialState(material: Material) {
  let state = materialStates.get(material);
  if (!state) {
    state = {
      transparent: material.transparent,
      depthWrite: material.depthWrite,
      alphaTest: material.alphaTest,
    };
    materialStates.set(material, state);
  }
  return state;
}

export class DTSAnimationClip extends AnimationClip {
  sequence?: DTSSequence;
  /** Absolute object-state tracks for Torque priority selection. */
  objectAnimation?: AnimationClip;
  triggers: readonly DTSTrigger[] = [];
  groundMotion?: AnimationClip;
  override clone(): this {
    const result = new DTSAnimationClip(
      this.name,
      this.duration,
      this.tracks.map((t) => t.clone()),
      this.blendMode,
    );
    result.sequence = this.sequence;
    result.objectAnimation = this.objectAnimation?.clone();
    result.triggers = this.triggers;
    result.groundMotion = this.groundMotion;
    return result as this;
  }
}

const cameraPosition = new Vector3(),
  localCamera = new Vector3(),
  center = new Vector3(),
  worldPosition = new Vector3(),
  worldScale = new Vector3();
const billboard = new Matrix4(),
  rotation = new Quaternion();
const cameraSettings = new WeakMap<
  Camera,
  { viewportHeight: number; lodEnabled: boolean }
>();

/** Supply render settings without visiting every shape or changing overrides. */
export function setDTSRenderSettings(
  camera: Camera,
  viewportHeight: number,
  lodEnabled = true,
): void {
  const settings = cameraSettings.get(camera);
  if (settings) {
    settings.viewportHeight = viewportHeight;
    settings.lodEnabled = lodEnabled;
  } else cameraSettings.set(camera, { viewportHeight, lodEnabled });
}

/** Renderer-recognized LOD with Torque's screen-size thresholds. Retains a
 * Object3D scene API, so SkeletonUtils.clone and AnimationMixer work normally. */
export class DTSShape extends LOD {
  readonly isDTSShape = true;
  data!: DTSShapeData;
  /** Optional override; the renderer normally supplies the camera's viewport. */
  viewportHeight: number | null = null;
  /** null selects by screen size; an index explicitly selects any detail. */
  detailLevel: number | null = 0;
  /** Fraction of distance retained when returning to a more detailed mesh. */
  lodHysteresis = 0.1;
  private selectedDetail?: number;
  private selectionCamera?: Camera;
  /** 1 retains this detail; 0 collapses its authored merge vertices. */
  intraDetailLevel = 1;
  ignoreDetailSize = false;
  decalFrames: number[] = [];
  iflTimes: number[] = [];
  iflLoops: boolean[] = [];
  imageAnimations: readonly DTSImageAnimation[] = [];
  imageAnimationEnabled = true;
  private imageFrames: (Texture | null)[] = [];
  branches: readonly DTSBranch[] = [];
  private createdBranches = new Set<DTSBranch>();
  private branchesByDetail?: DTSBranch[][];
  private pendingBranches: Set<DTSBranch>[] = [];
  private meshInitializers = new Set<
    (mesh: DTSRenderable | DTSMeshBatch) => void
  >();
  meshBatchFactory?: (detail: number) => readonly DTSMeshBatch[];
  private createdBatchDetails = new Set<number>();
  /** Changes when lazy geometry is added, for consumers caching mesh lists. */
  meshVersion = 0;
  /** Override the free-running IFL clock for deterministic playback. */
  time: number | null = null;
  setImageAnimationTime(
    time: number,
    enabled = this.imageAnimationEnabled,
  ): void {
    this.time = time;
    this.imageAnimationEnabled = enabled;
  }
  private startTime = performance.now();
  private renderables?: DTSRenderable[];
  private detailMeshes?: DTSRenderable[][];
  private activeDetail?: number;
  private hierarchy = new DTSHierarchy(this);
  private shapeObjects?: Map<number, DTSObject>;
  private meshBatches?: DTSMeshBatch[];
  override copy(source: this, recursive = true): this {
    Object3D.prototype.copy.call(this, source, recursive);
    this.autoUpdate = source.autoUpdate;
    this.data = source.data;
    this.viewportHeight = source.viewportHeight;
    this.detailLevel = source.detailLevel;
    this.lodHysteresis = source.lodHysteresis;
    this.selectedDetail = undefined;
    this.selectionCamera = undefined;
    this.intraDetailLevel = source.intraDetailLevel;
    this.ignoreDetailSize = source.ignoreDetailSize;
    this.decalFrames = source.decalFrames.slice();
    this.iflTimes = source.iflTimes.slice();
    this.iflLoops = source.iflLoops.slice();
    this.imageAnimations = source.imageAnimations;
    this.imageAnimationEnabled = source.imageAnimationEnabled;
    this.imageFrames = [];
    this.branches = source.branches;
    this.createdBranches = new Set(source.createdBranches);
    this.branchesByDetail = source.branchesByDetail;
    this.pendingBranches = [];
    this.meshInitializers = new Set();
    this.meshBatchFactory = source.meshBatchFactory;
    this.createdBatchDetails = new Set(source.createdBatchDetails);
    this.meshVersion = source.meshVersion;
    this.time = source.time;
    this.renderables = undefined;
    this.detailMeshes = undefined;
    this.activeDetail = undefined;
    this.shapeObjects = undefined;
    this.hierarchy = new DTSHierarchy(this);
    this.meshBatches = undefined;
    return this;
  }
  /** Configure meshes added after cloning, before their first render. */
  onMeshAdded(
    initialize: (mesh: DTSRenderable | DTSMeshBatch) => void,
  ): () => void {
    this.meshInitializers.add(initialize);
    return () => this.meshInitializers.delete(initialize);
  }
  getShapeObject(index: number): DTSObject | undefined {
    return this.hierarchy.object(index);
  }
  getNode(index: number): DTSNode | undefined {
    return this.hierarchy.node(index);
  }
  /** Torque node names are case insensitive; lookup creates only this path. */
  getNodeByName(name: string): DTSNode | undefined {
    return this.hierarchy.findNode(name);
  }
  ensureNodes(accept?: (name: string) => boolean): void {
    this.hierarchy.ensureNodes(accept);
  }
  prepareAnimationTargets(): void {
    this.hierarchy.prepareAnimations();
  }
  /** Root-scoped Three bindings must never search into mounted DTS shapes. */
  get animationTargets(): Record<string, Object3D> {
    return this.hierarchy.animationTargets;
  }
  override getObjectByName(name: string): Object3D | undefined {
    // Authored node order wins over realization order and mounted content.
    const own = this.data && this.hierarchy.findObject(name);
    if (own) return own;
    return super.getObjectByName(name);
  }
  /** Realize this detail and its currently enabled decals, at most once. */
  ensureDetail(detail: number): void {
    if (!this.branchesByDetail) {
      this.branchesByDetail = this.data.details.map(() => []);
      for (const branch of this.branches)
        for (const index of branch.detailIndices)
          this.branchesByDetail[index]?.push(branch);
    }
    const branches = this.branchesByDetail[detail];
    if (!branches) return;
    // Share the immutable layout; allocate a work list only for requested details.
    const pending = (this.pendingBranches[detail] ??= new Set(
      branches.filter((branch) => !this.createdBranches.has(branch)),
    ));
    for (const branch of pending) {
      if (
        branch.decalIndex === undefined ||
        (this.decalFrames[branch.decalIndex] ?? -1) >= 0
      )
        this.realizeBranch(branch);
      if (this.createdBranches.has(branch)) pending.delete(branch);
    }
    if (this.meshBatchFactory && !this.createdBatchDetails.has(detail)) {
      this.initializeRuntime();
      this.createdBatchDetails.add(detail);
      const meshes = new Map(
        this.renderables!.map((mesh) => [mesh.binding!, mesh]),
      );
      for (const template of this.meshBatchFactory(detail)) {
        const batch = template.clone();
        if (
          batch instanceof DTSRigidMeshBatch &&
          template instanceof DTSRigidMeshBatch
        )
          batch.skeleton = new Skeleton(
            template.skeleton.bones.map((bone) =>
              this.getNode((bone as DTSNode).nodeIndex)!,
            ),
            template.skeleton.boneInverses,
          );
        batch.initialize(meshes, this.shapeObjects!);
        this.add(batch);
        this.meshBatches!.push(batch);
        batch.updateMatrixWorld(true);
        for (const initialize of this.meshInitializers) initialize(batch);
        this.meshVersion++;
      }
    }
  }
  /** Explicit expansion for tools that need to inspect every visual mesh. */
  ensureAllDetails(): void {
    for (const branch of this.branches) this.realizeBranch(branch);
  }
  private realizeBranch(branch: DTSBranch): void {
    if (this.createdBranches.has(branch)) return;
    this.initializeRuntime();
    const object = this.getShapeObject(branch.objectIndex);
    if (!object) return;
    const detail = branch.create().clone();
    this.createdBranches.add(branch);
    object.add(detail);
    detail.traverse((node) => {
      if (!isDTSMesh(node)) return;
      for (const index of node.binding!.source.skin?.nodeIndices ?? [])
        this.getNode(index)!.updateWorldMatrix(true, false);
      // Templates are shared, but a skin must bind to this instance's bones.
      if (node instanceof SkinnedMesh)
        node.skeleton = new Skeleton(
          node.skeleton.bones.map((bone) =>
            this.getNode((bone as DTSNode).nodeIndex)!,
          ),
          node.skeleton.boneInverses,
        );
      this.renderables!.push(node);
      for (const index of node.binding!.detailIndices)
        this.detailMeshes![index]?.push(node);
      object.applyMeshOpacity(node);
      for (const initialize of this.meshInitializers) initialize(node);
    });
    detail.updateWorldMatrix(true, true, true);
    this.meshVersion++;
  }
  private initializeRuntime(): void {
    if (!this.renderables) {
      this.renderables = [];
      this.shapeObjects = this.hierarchy.objects;
      this.meshBatches = [];
      const visit = (node: Object3D) => {
        if (node !== this && (node as DTSShape).isDTSShape) return;
        if (isDTSMesh(node)) this.renderables!.push(node);
        if (isDTSMeshBatch(node)) this.meshBatches!.push(node);
        for (const child of node.children) visit(child);
      };
      visit(this);
      this.detailMeshes = this.data.details.map(() => []);
      for (const mesh of this.renderables)
        for (const detail of mesh.binding!.detailIndices)
          this.detailMeshes[detail]?.push(mesh);
      if (this.meshBatches.length) {
        const meshes = new Map(
          this.renderables.map((mesh) => [mesh.binding!, mesh]),
        );
        for (const batch of this.meshBatches)
          batch.initialize(meshes, this.shapeObjects);
      }
    }
  }
  /** The standard renderer invokes this before projecting the child meshes. */
  override update(camera: Camera): void {
    if (!this.data) return;
    this.initializeRuntime();
    // Like Three's LOD.update, consume the renderer's current camera matrix.
    cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    let detail: number;
    if (this.detailLevel === null && !this.ignoreDetailSize) {
      detail = this.selectDetail(camera);
      this.intraDetailLevel = 1;
    } else {
      detail = this.detailLevel ?? 0;
      this.selectedDetail = undefined;
      this.selectionCamera = undefined;
    }
    // Runtime-generated billboard details have no stored triangles. Until a
    // host supplies an impostor, retain the requested source mesh detail.
    if (
      this.data.details[detail]?.subShape < 0 &&
      !this.children.some(
        (child) => isDTSImpostor(child) && child.detailIndex === detail,
      )
    )
      detail = this.data.details[detail].billboard?.detailLevel ?? 0;
    for (const child of this.children)
      if (isDTSImpostor(child)) child.visible = child.detailIndex === detail;
    const imageFrames = this.imageFrames;
    for (let i = 0; i < this.imageAnimations.length; i++) {
      const animation = this.imageAnimations[i];
      let time = this.iflTimes[animation.iflIndex];
      if (time < 0)
        time = animation.sequenceControlled
          ? 0
          : (this.time ?? (performance.now() - this.startTime) / 1000);
      imageFrames[i] = getDTSImageFrame(
        animation,
        this.imageAnimationEnabled ? time : 0,
        this.iflLoops[animation.iflIndex],
      );
    }
    const changedDetail = this.activeDetail !== detail;
    if (changedDetail) {
      for (const mesh of this.renderables!) mesh.parent!.visible = false;
      this.activeDetail = detail;
    }
    const showDetail =
      this.ignoreDetailSize || this.data.details[detail]?.size >= 0;
    if (showDetail) this.ensureDetail(detail);
    for (const batch of this.meshBatches!) batch.updateBatch(this, detail);
    for (const mesh of this.detailMeshes![detail] ?? []) {
      const binding = mesh.binding!;
      // A user-hidden mesh stays hidden; detail selection acts on a dedicated parent.
      const detailGroup = mesh.parent!;
      const object = this.shapeObjects!.get(binding.objectIndex);
      const decalState =
        binding.decalIndex === undefined
          ? undefined
          : (this.decalFrames[binding.decalIndex] ?? -1);
      const wasVisible = detailGroup.visible;
      detailGroup.visible =
        showDetail &&
        !(detailGroup as DTSDetail).batched &&
        (decalState === undefined ||
          (decalState >= 0 &&
            decalState < binding.source.decal!.startPrimitive.length));
      if (decalState !== undefined) mesh.visible = detailGroup.visible;
      if (!detailGroup.visible) continue;
      if (!wasVisible) detailGroup.updateMatrixWorld(true);
      if (object && !object.visible) continue;
      if (!mesh.visible) continue;
      if (mesh instanceof DTSMesh) mesh.restoreNativeGeometry();
      const dynamic =
        binding.source.sorted ||
        binding.source.numFrames > 1 ||
        binding.source.numMaterialFrames > 1 ||
        binding.decalIndex !== undefined ||
        binding.source.mergeIndices.length ||
        binding.source.skin;
      if (dynamic && mesh instanceof DTSMesh) mesh.prepareGeometry();
      const frame = Math.max(
        0,
        Math.min(
          Math.floor(object?.frame ?? 0),
          binding.frames.positions.length - 1,
        ),
      );
      const materialFrame = Math.max(0, Math.floor(object?.materialFrame ?? 0));
      if (dynamic) this.updateMesh(mesh, frame, materialFrame);
      if (binding.source.mergeIndices.length && !binding.source.skin)
        mergeDTSVertices(mesh, frame, materialFrame, this.intraDetailLevel);
      if (mesh instanceof SkinnedMesh && mesh.frustumCulled)
        mesh.computeBoundingSphere();
      for (let i = 0; i < this.imageAnimations.length; i++) {
        const index = this.imageAnimations[i].materialIndex;
        if (
          !imageFrames![i] ||
          (binding.materialIndex !== index && !Array.isArray(mesh.material))
        )
          continue;
        const material = (
          Array.isArray(mesh.material) ? mesh.material[index] : mesh.material
        ) as MeshLambertMaterial;
        if (material) {
          if (!material.map) material.needsUpdate = true;
          material.map = imageFrames![i];
          if (
            "emissiveMap" in material &&
            this.data.materials[index].flags &
              (DTSMaterialFlags.SelfIlluminating |
                DTSMaterialFlags.Additive |
                DTSMaterialFlags.Subtractive)
          )
            material.emissiveMap = imageFrames![i];
        }
      }
      if (binding.source.skin && !(mesh instanceof SkinnedMesh))
        this.updateWeightedSkin(mesh);
      if (binding.source.flags & 0x80000000) {
        mesh.matrixWorld.decompose(worldPosition, rotation, worldScale);
        localCamera.copy(cameraPosition);
        if (binding.source.flags & 0x20000000) localCamera.y = worldPosition.y;
        billboard.lookAt(localCamera, worldPosition, Object3D.DEFAULT_UP);
        rotation.setFromRotationMatrix(billboard);
        mesh.matrixWorld.compose(worldPosition, rotation, worldScale);
      }
      if (binding.source.sorted) {
        if (binding.source.sorted.alwaysWriteDepth)
          for (const material of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material])
            material.depthWrite = true;
        this.sortMesh(mesh, frame);
      }
      if (mesh instanceof DTSMesh) mesh.refreshProcessedGeometry();
    }
  }
  override raycast(): void {
    /* Child meshes handle ray intersections. */
  }
  selectDetail(camera: Camera): number {
    const settings = cameraSettings.get(camera);
    if (settings?.lodEnabled === false) {
      this.selectedDetail = undefined;
      this.selectionCamera = undefined;
      return 0;
    }
    cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    dtsVector(this.data.center, 0, center).applyMatrix4(this.matrixWorld);
    const distance = center.distanceTo(cameraPosition);
    const scale = this.matrixWorld.getMaxScaleOnAxis();
    const perspective = camera.projectionMatrix.elements[15] === 0;
    const pixels =
      (this.data.radius *
        scale *
        (this.viewportHeight ?? settings?.viewportHeight ?? 1024) *
        Math.abs(camera.projectionMatrix.elements[5])) /
      (2 * (perspective ? Math.max(distance, 0.001) : 1));
    let smallest = -1;
    let selected = -1;
    for (let i = 0; i < this.data.details.length; i++) {
      const detail = this.data.details[i];
      if (detail.size < 0) continue;
      smallest = i;
      if (pixels > detail.size) {
        selected = i;
        break;
      }
    }
    if (selected < 0 && pixels >= this.data.smallestVisibleSize)
      selected = smallest;
    const previous =
      this.selectionCamera === camera ? this.selectedDetail : undefined;
    const hysteresis = Math.max(0, Math.min(0.99, this.lodHysteresis));
    if (
      previous !== undefined &&
      selected >= 0 &&
      (previous < 0 || selected < previous)
    ) {
      const threshold =
        previous < 0
          ? this.data.smallestVisibleSize
          : this.data.details[previous - 1].size;
      if (pixels <= threshold / (1 - hysteresis)) selected = previous;
    }
    this.selectionCamera = camera;
    this.selectedDetail = selected;
    return selected;
  }
  private updateMesh(
    mesh: DTSRenderable,
    frame: number,
    materialFrame: number,
  ) {
    const { source, frames, decalIndex } = mesh.binding!;
    const decalState =
      decalIndex === undefined
        ? undefined
        : (this.decalFrames[decalIndex] ?? -1);
    let state = meshStates.get(mesh);
    if (
      state?.frame === frame &&
      state.materialFrame === materialFrame &&
      state.decalState === decalState
    )
      return;
    const changedDecal = !state || state.decalState !== decalState;
    if (!state) {
      state = { frame, materialFrame, decalState };
      meshStates.set(mesh, state);
    } else {
      state.frame = frame;
      state.materialFrame = materialFrame;
      state.decalState = decalState;
    }
    // Single-frame shapes may have procedural morphs (e.g. chest physics).
    // Only native vertex-frame animation owns and resets these weights.
    if (source.numFrames > 1 && mesh.morphTargetInfluences) {
      mesh.morphTargetInfluences.fill(0);
      mesh.morphTargetInfluences[frame] = 1;
    } else if (source.sorted || source.numFrames > 1) {
      mesh.geometry.setAttribute("position", frames.positions[frame]);
      mesh.geometry.setAttribute("normal", frames.normals[frame]);
      if (frames.colors[frame])
        mesh.geometry.setAttribute("color", frames.colors[frame]);
    }
    if (source.numMaterialFrames > 1 || source.sorted) {
      const uvIndex = source.sorted
        ? materialFrame || frame
        : materialFrame % source.numMaterialFrames;
      const uv = frames.uv[uvIndex];
      if (uv) mesh.geometry.setAttribute("uv", uv);
      if (frames.uv1[uvIndex])
        mesh.geometry.setAttribute("uv1", frames.uv1[uvIndex]);
    }
    if (decalIndex !== undefined && source.decal) {
      const state = this.decalFrames[decalIndex] ?? -1;
      mesh.visible = state >= 0 && state < source.decal.startPrimitive.length;
      if (!mesh.visible) return;
      const start = source.decal.startPrimitive[state],
        end = source.decal.startPrimitive[state + 1] ?? frames.triangles.length;
      if (changedDecal)
        setTriangles(mesh.geometry, frames.triangles.slice(start, end));
      const position = frames.positions[frame];
      const uv = mesh.geometry.getAttribute("uv") as BufferAttribute;
      for (const i of source.indices) {
        const x = -position.getX(i),
          y = position.getZ(i),
          z = position.getY(i),
          offset = state * 4;
        const s = source.decal.texgenS,
          t = source.decal.texgenT;
        uv.setXY(
          i,
          x * s[offset] + y * s[offset + 1] + z * s[offset + 2] + s[offset + 3],
          x * t[offset] + y * t[offset + 1] + z * t[offset + 2] + t[offset + 3],
        );
      }
      uv.needsUpdate = true;
    }
  }
  private updateWeightedSkin(mesh: DTSMesh) {
    const { source, frames } = mesh.binding!,
      skin = source.skin!;
    const position = mesh.geometry.getAttribute("position") as BufferAttribute;
    const normal = mesh.geometry.getAttribute("normal") as BufferAttribute;
    position.array.fill(0);
    normal.array.fill(0);
    const toLocal = new Matrix4().copy(mesh.matrixWorld).invert();
    const matrices = Array.from(skin.nodeIndices, (node, i) =>
      new Matrix4()
        .fromArray(skin.inverseBindMatrices, i * 16)
        .transpose()
        .premultiply(DTS_BASIS)
        .multiply(DTS_BASIS)
        .premultiply(this.getNode(node)!.matrixWorld)
        .premultiply(toLocal),
    );
    const p = new Vector3(),
      n = new Vector3();
    for (let i = 0; i < skin.weights.length; i++) {
      const vertex = skin.vertexIndices[i],
        matrix = matrices[skin.boneIndices[i]],
        weight = skin.weights[i];
      p.fromBufferAttribute(frames.positions[0], vertex)
        .applyMatrix4(matrix)
        .multiplyScalar(weight);
      const e = matrix.elements,
        normals = frames.normals[0];
      const x = normals.getX(vertex),
        y = normals.getY(vertex),
        z = normals.getZ(vertex);
      n.set(
        e[0] * x + e[4] * y + e[8] * z,
        e[1] * x + e[5] * y + e[9] * z,
        e[2] * x + e[6] * y + e[10] * z,
      ).multiplyScalar(weight);
      position.setXYZ(
        vertex,
        position.getX(vertex) + p.x,
        position.getY(vertex) + p.y,
        position.getZ(vertex) + p.z,
      );
      normal.setXYZ(
        vertex,
        normal.getX(vertex) + n.x,
        normal.getY(vertex) + n.y,
        normal.getZ(vertex) + n.z,
      );
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }
  private sortMesh(mesh: DTSRenderable, frame: number) {
    const { source, frames } = mesh.binding!,
      sorted = source.sorted!;
    let order = sortOrders.get(mesh);
    if (!order) {
      order = {
        path: new Int32Array(sorted.clusters.length),
        count: -1,
        frame: -1,
        world: new Matrix4(),
        inverse: new Matrix4(),
        camera: new Vector3(),
      };
      sortOrders.set(mesh, order);
    }
    if (order.count < 0 || !order.world.equals(mesh.matrixWorld)) {
      order.world.copy(mesh.matrixWorld);
      order.inverse.copy(mesh.matrixWorld).invert();
    } else if (order.frame === frame && order.camera.equals(cameraPosition))
      return;
    order.camera.copy(cameraPosition);
    localCamera.copy(cameraPosition).applyMatrix4(order.inverse);
    // Convert the camera back to Torque coordinates for the source planes.
    const x = -localCamera.x,
      y = localCamera.z,
      z = localCamera.y;
    let index = sorted.startCluster[frame],
      visited = 0;
    let changed = order.frame !== frame;
    order.frame = frame;
    while (index >= 0) {
      const cluster = sorted.clusters[index];
      if (!cluster || visited >= sorted.clusters.length)
        throw new Error("DTS: invalid sorted cluster chain");
      if (order.path[visited] !== index) changed = true;
      order.path[visited++] = index;
      index =
        cluster.frontCluster === cluster.backCluster
          ? cluster.frontCluster
          : x * cluster.normal[0] +
                y * cluster.normal[1] +
                z * cluster.normal[2] >
              cluster.k
            ? cluster.frontCluster
            : cluster.backCluster;
    }
    // Cluster paths are normally unchanged across frames. Avoid GPU uploads.
    if (!changed && order.count === visited) return;
    order.count = visited;
    let variants = sortedGeometry.get(mesh.binding!);
    if (!variants) sortedGeometry.set(mesh.binding!, (variants = new Map()));
    const key = `${frame}/${order.path.subarray(0, visited).join(",")}`;
    let variant = variants.get(key);
    if (!variant) {
      const geometry = new BufferGeometry();
      const primitives: number[] = [];
      for (let k = 0; k < visited; k++) {
        const cluster = sorted.clusters[order.path[k]];
        for (let i = cluster.startPrimitive; i < cluster.endPrimitive; i++)
          primitives.push(i);
      }
      setTriangles(
        geometry,
        primitives.map((i) => frames.triangles[i]),
      );
      geometry.clearGroups();
      let offset = 0;
      for (const i of primitives) {
        const count = frames.triangles[i].length;
        const material =
          source.primitives[i].material & 0x10000000
            ? this.data.materials.length
            : source.primitives[i].material & 0x0fffffff;
        // Preserve back-to-front order, batching only consecutive equal materials.
        const previous = geometry.groups.at(-1);
        if (previous?.materialIndex === material) previous.count += count;
        else if (count) geometry.addGroup(offset, count, material);
        offset += count;
      }
      variant = {
        index: geometry.index!,
        groups: geometry.groups,
        count: geometry.drawRange.count,
      };
      sharedSortedIndices.add(variant.index);
      if (variants.size >= 64) variants.delete(variants.keys().next().value!);
      variants.set(key, variant);
    }
    // Camera-dependent paths select immutable shared buffers. Instances on the
    // same side of the cluster planes can share draws and GPU index storage.
    mesh.geometry.setIndex(variant.index);
    mesh.geometry.groups = variant.groups;
    mesh.geometry.setDrawRange(0, variant.count);
  }
}
interface MergeBuffers {
  position: BufferAttribute;
  uv?: BufferAttribute;
  sourcePosition?: BufferAttribute;
  sourceUV?: BufferAttribute;
  weight: number;
}
const mergeBuffers = new WeakMap<Mesh, MergeBuffers>();
/** TSMesh::saveMergeVerts interpolates only position and primary UV; source
 * normals stay authored. Read every target from the unmodified frame. */
function mergeDTSVertices(
  mesh: DTSRenderable,
  frame: number,
  materialFrame: number,
  weight: number,
) {
  const { source, frames } = mesh.binding!;
  const position = frames.positions[frame],
    uv = frames.uv[materialFrame % Math.max(source.numMaterialFrames, 1)];
  weight = Math.max(0, Math.min(1, weight));
  if (weight === 1) {
    mesh.geometry.setAttribute("position", position);
    if (uv?.count === position.count) mesh.geometry.setAttribute("uv", uv);
    return;
  }
  let buffers = mergeBuffers.get(mesh);
  if (!buffers || buffers.position.count !== position.count) {
    buffers = { position: position.clone(), uv: uv?.clone(), weight: -1 };
    mergeBuffers.set(mesh, buffers);
  }
  if (
    buffers.weight !== weight ||
    buffers.sourcePosition !== position ||
    buffers.sourceUV !== uv
  ) {
    buffers.position.array.set(position.array);
    if (uv && buffers.uv) buffers.uv.array.set(uv.array);
    const start = position.count - source.mergeIndices.length;
    for (let i = 0; i < source.mergeIndices.length; i++) {
      const to = source.mergeIndices[i],
        from = start + i;
      for (let axis = 0; axis < 3; axis++)
        buffers.position.array[from * 3 + axis] =
          position.array[from * 3 + axis] * weight +
          position.array[to * 3 + axis] * (1 - weight);
      if (uv && buffers.uv)
        for (let axis = 0; axis < 2; axis++)
          buffers.uv.array[from * 2 + axis] =
            uv.array[from * 2 + axis] * weight +
            uv.array[to * 2 + axis] * (1 - weight);
    }
    buffers.position.needsUpdate = true;
    if (buffers.uv) buffers.uv.needsUpdate = true;
    buffers.weight = weight;
    buffers.sourcePosition = position;
    buffers.sourceUV = uv;
  }
  mesh.geometry.setAttribute("position", buffers.position);
  if (buffers.uv?.count === position.count)
    mesh.geometry.setAttribute("uv", buffers.uv);
}
const sharedSortedIndices = new WeakSet<BufferAttribute>();
const sortedGeometry = new WeakMap<
  DTSMeshBinding,
  Map<
    string,
    { index: BufferAttribute; groups: BufferGeometry["groups"]; count: number }
  >
>();
const sortOrders = new WeakMap<
  Mesh,
  {
    path: Int32Array;
    count: number;
    frame: number;
    world: Matrix4;
    inverse: Matrix4;
    camera: Vector3;
  }
>();
const meshStates = new WeakMap<
  Mesh,
  { frame: number; materialFrame: number; decalState: number | undefined }
>();
function setTriangles(geometry: BufferGeometry, triangles: Uint32Array[]) {
  const count = triangles.reduce((n, a) => n + a.length, 0);
  let attribute = geometry.getIndex();
  if (!attribute || attribute.count < count) {
    attribute = new BufferAttribute(new Uint32Array(count), 1);
    geometry.setIndex(attribute);
  }
  let offset = 0;
  for (const array of triangles) {
    attribute.array.set(array, offset);
    offset += array.length;
  }
  attribute.needsUpdate = true;
  geometry.setDrawRange(0, count);
}

export interface DTSModel {
  scene: DTSShape;
  animations: DTSAnimationClip[];
  nodes: DTSNode[];
  materials: DTSMaterial[];
  data: DTSShapeData;
  bounds: Box3;
}
