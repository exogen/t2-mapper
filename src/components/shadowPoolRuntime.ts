import { DTSShape } from "../dts/dtsModel";
/**
 * Engine-style projected shadows (Tribes2.exe shadow.cc) for the
 * registered shadowCasters: players and vehicles. Per caster and
 * frame it
 *   - culls and fades by the caster's projected radius (Shadow::prepare),
 *   - tilts the constant light toward vertical with camera distance,
 *   - re-renders the caster's silhouette into a 64-px atlas tile at the
 *     engine's 25/100 ms cadence (its software rasteriser + 3x3 blur,
 *     here an orthographic render of black proxy meshes),
 *   - gathers and caches terrain squares and interior triangles inside the
 *     projection box (±R laterally, 10R along the light) that face the
 *     light, and
 *   - renders those receivers' depth from the light into a second atlas
 *     tile, so the decal shader keeps only the nearest receiver along
 *     the light — the engine's DepthSortList partition (FUN_00423200)
 *     carves the shadow footprint nearest-first, so a floor slab takes
 *     the shadow and the wall beneath it gets none, and
 *   - draws them with the silhouette projected on, darkening the
 *     framebuffer by silhouette x (1 - depth / reach) x fade (the
 *     engine's LUMINANCE bitmap modulated by the vertex colour under
 *     glBlendFunc(GL_ZERO, GL_ONE_MINUS_SRC_COLOR) — our alpha plays the
 *     luminance's role), no depth write, polygon offset.
 * Casters below ~10 projected pixels get the engine's generic blob.
 */
import {
  AddEquation,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DepthTexture,
  DetachedBindMode,
  DoubleSide,
  Group,
  LinearFilter,
  Matrix4,
  NearestFilter,
  Mesh,
  MeshBasicMaterial,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SkinnedMesh,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  ZeroFactor,
} from "three";
import type {
  Camera,
  Fog,
  Object3D,
  PerspectiveCamera,
  WebGLRenderer,
} from "three";
import { hazeAndFog } from "../globalFogUniforms";
import { isVisibleInHierarchy } from "../objectUtils";
import {
  SHADOW_GENERIC_ALPHA,
  SHADOW_GENERIC_RADIUS_SCALE,
  SHADOW_REACH_FACTOR,
  SHADOW_RECEIVER_FACING,
  projectedRadiusPx,
  shadowDistanceFade,
  shadowLightDir,
  shadowLightToWorld,
  shadowTileSpec,
  shadowVisibility,
} from "../shadowProjection";
import {
  interiorTrianglesInBox,
  interiorColliderVersion,
} from "../collision/worldCollision";
import { terrainTrianglesInBox } from "../collision/terrainCollision";
import {
  collisionState,
  type CollisionState,
} from "../collision/collisionContext";
import { shadowCasters, type ShadowCaster } from "./shadowCasters";

const ATLAS_SIZE = 1024;
const TILE_SIZE = 64;
const TILES_PER_ROW = ATLAS_SIZE / TILE_SIZE;
const MAX_CASTERS = TILES_PER_ROW * TILES_PER_ROW;
/** How often a caster's subtree is re-walked for silhouette proxies. */
const PROXY_RESCAN_SEC = 0.5;
/** Shadows this faded (pixel fade or haze) are not drawn (engine 0.99). */
const FADE_CUTOFF = 0.99;
/**
 * Shadows draw early in the transparent pass: after the sky dome and
 * cloud layers (-1000..) but before water (-1) and every effect. They lie
 * on opaque receivers (depth-tested, no depth write), so transparent
 * effects in front — explosions, beams — must blend over them afterwards;
 * sorted by their identity transform they would land at the world origin
 * and could darken an explosion drawn before them.
 */
const SHADOW_RENDER_ORDER = -500;
/** A caster that has not drawn for this long releases its tile and buffers. */
const IDLE_RELEASE_MS = 3000;
/** Receiver buffer capacity in triangles (grown by replacement when exceeded). */
const INITIAL_RECEIVER_TRIANGLES = 64;

const shadowVertexShader = /* glsl */ `
uniform mat4 worldToLight;
varying vec3 vLight;
varying vec3 vWorld;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorld = worldPos.xyz;
  vLight = (worldToLight * worldPos).xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const shadowFragmentShader = /* glsl */ `
uniform sampler2D atlas;
/** Tile origin (xy), tile scale (z) and one atlas texel (w). */
uniform vec4 tile;
uniform float radius;
uniform float reach;
/** 1 - the pixel-size/haze fade, applied with the depth falloff. */
uniform float fadeScale;
/** The caster's own fade (mFadeVal); below 1 it REPLACES the per-vertex
 *  darkening, as Shadow::render swaps the colour array for glColor4f. */
uniform float objectAlpha;
uniform float blur;
uniform float generic;
/** Receiver depth from the light (previous frame's frame/reach/radius). */
uniform sampler2D receiverDepth;
uniform mat4 worldToLightDepth;
uniform float depthRadius;
uniform float depthReach;
uniform float hasDepth;
varying vec3 vLight;
varying vec3 vWorld;

float tap(vec2 uv, vec2 offset) {
  float inset = 0.5 * tile.w;
  vec2 atlasUv = tile.xy + uv * tile.z + offset * tile.w;
  atlasUv = clamp(atlasUv, tile.xy + inset, tile.xy + tile.z - inset);
  return texture2D(atlas, atlasUv).a;
}

/**
 * Nearest-receiver test: discard fragments farther along the light than
 * the receiver depth rendered at this point. The bias covers one tile
 * texel of slope on the receiver plus a little constant.
 */
bool occluded() {
  if (hasDepth < 0.5) return false;
  vec3 ld = (worldToLightDepth * vec4(vWorld, 1.0)).xyz;
  vec2 duv = ld.xz / (2.0 * depthRadius) + 0.5;
  if (any(lessThan(duv, vec2(0.0))) || any(greaterThan(duv, vec2(1.0)))) return false;
  float inset = 0.5 * tile.w;
  vec2 atlasUv = clamp(tile.xy + duv * tile.z, tile.xy + inset, tile.xy + tile.z - inset);
  float nearest = texture2D(receiverDepth, atlasUv).r;
  vec3 n = normalize(cross(dFdx(ld), dFdy(ld)));
  float slope = sqrt(max(0.0, 1.0 - n.y * n.y)) / max(abs(n.y), 0.05);
  float texel = 2.0 * depthRadius / ${TILE_SIZE.toFixed(1)};
  float bias = (texel * slope + 0.02 * depthRadius) / depthReach;
  return ld.y / depthReach > nearest + bias;
}

void main() {
  if (vLight.y < 0.0 || vLight.y > reach) discard;
  vec2 uv = vLight.xz / (2.0 * radius) + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) discard;
  if (occluded()) discard;
  float a;
  if (generic > 0.5) {
    vec2 d = uv * 2.0 - 1.0;
    float r2 = dot(d, d);
    a = r2 <= 0.99 ? ${SHADOW_GENERIC_ALPHA.toFixed(5)} * (1.0 - r2) : 0.0;
  } else if (blur > 0.5) {
    a = (tap(uv, vec2(-1.0, -1.0)) + 2.0 * tap(uv, vec2(0.0, -1.0)) + tap(uv, vec2(1.0, -1.0))
       + 2.0 * tap(uv, vec2(-1.0, 0.0)) + 3.0 * tap(uv, vec2(0.0, 0.0)) + 2.0 * tap(uv, vec2(1.0, 0.0))
       + tap(uv, vec2(-1.0, 1.0)) + 2.0 * tap(uv, vec2(0.0, 1.0)) + tap(uv, vec2(1.0, 1.0))) / 15.0;
  } else {
    a = tap(uv, vec2(0.0));
  }
  a *= objectAlpha < 1.0
    ? objectAlpha
    : fadeScale * (1.0 - vLight.y / reach);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}
`;

interface ShadowProxy {
  source: Mesh;
  proxy: Mesh;
}

interface CasterState {
  caster: ShadowCaster;
  proxyGroup: Group;
  proxies: ShadowProxy[];
  meshSubscriptions: Map<DTSShape, () => void>;
  scannedAt: number;
  tile: number;
  lastRenderMs: number;
  geometry: BufferGeometry;
  material: ShaderMaterial;
  mesh: Mesh;
  lightToWorld: Matrix4;
  /** Receiver-depth mesh sharing `geometry`, in the depth scene. */
  depthMesh: Mesh;
  /** Last frame the shadow drew; idle states give their tile back. */
  lastVisibleMs: number;
  receiverWorld?: CollisionState;
  receiverTerrain?: CollisionState["terrain"];
  receiverInteriors: number;
  receiverFrame: Matrix4;
  receiverRadius: number;
  receiverReach: number;
  hasReceivers: boolean;
  depthDirty: boolean;
}

const _center = new Vector3();
const _dir = new Vector3();
const _zAxis = new Vector3();
const _corner = new Vector3();
const _box = new Box3();
const _viewportSize = new Vector2();
const _clearColor = new Color();
const _positions: number[] = [];
const _facing = { dir: new Vector3(), threshold: SHADOW_RECEIVER_FACING };

function createProxy(source: Mesh, material: MeshBasicMaterial): Mesh {
  const skinned = (source as SkinnedMesh).isSkinnedMesh
    ? (source as SkinnedMesh)
    : null;
  let proxy: Mesh;
  if (skinned) {
    const clone = new SkinnedMesh(skinned.geometry, material);
    clone.bind(skinned.skeleton, skinned.bindMatrix);
    clone.bindMode = DetachedBindMode;
    proxy = clone;
  } else {
    proxy = new Mesh(source.geometry, material);
  }
  proxy.morphTargetInfluences = source.morphTargetInfluences;
  proxy.morphTargetDictionary = source.morphTargetDictionary;
  proxy.frustumCulled = false;
  proxy.matrixAutoUpdate = false;
  proxy.matrixWorldAutoUpdate = false;
  proxy.onBeforeRender = () => {
    proxy.matrixWorld.copy(source.matrixWorld);
    if (skinned) {
      (proxy as SkinnedMesh).bindMatrixInverse.copy(skinned.bindMatrixInverse);
    }
  };
  return proxy;
}

function collectMeshes(node: Object3D, out: Mesh[]): void {
  if ((node as Mesh).isMesh) out.push(node as Mesh);
  for (const child of node.children) collectMeshes(child, out);
}

function sameSources(proxies: ShadowProxy[], sources: Mesh[]): boolean {
  if (proxies.length !== sources.length) return false;
  for (let i = 0; i < sources.length; i++) {
    if (proxies[i].source !== sources[i]) return false;
  }
  return true;
}

/** Pixel origin of an atlas tile. */
function tileOrigin(tile: number): [number, number] {
  return [
    (tile % TILES_PER_ROW) * TILE_SIZE,
    Math.floor(tile / TILES_PER_ROW) * TILE_SIZE,
  ];
}

function createReceiverGeometry(triangles: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(triangles * 9), 3),
  );
  geometry.setDrawRange(0, 0);
  return geometry;
}

function createMaterial(
  atlas: WebGLRenderTarget,
  depthAtlas: WebGLRenderTarget,
): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: shadowVertexShader,
    fragmentShader: shadowFragmentShader,
    uniforms: {
      atlas: { value: atlas.texture },
      receiverDepth: { value: depthAtlas.depthTexture },
      worldToLightDepth: { value: new Matrix4() },
      depthRadius: { value: 1 },
      depthReach: { value: 1 },
      hasDepth: { value: 0 },
      tile: {
        value: new Vector4(0, 0, TILE_SIZE / ATLAS_SIZE, 1 / ATLAS_SIZE),
      },
      worldToLight: { value: new Matrix4() },
      radius: { value: 1 },
      reach: { value: 1 },
      fadeScale: { value: 1 },
      objectAlpha: { value: 1 },
      blur: { value: 1 },
      generic: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: ZeroFactor,
    blendDst: OneMinusSrcAlphaFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

export class ShadowPoolRuntime {
  readonly atlas = new WebGLRenderTarget(ATLAS_SIZE, ATLAS_SIZE, {
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  });
  /** Receiver depth from the light, one tile per caster (same layout). */
  readonly depthAtlas = new WebGLRenderTarget(ATLAS_SIZE, ATLAS_SIZE, {
    format: RGBAFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
    depthTexture: new DepthTexture(ATLAS_SIZE, ATLAS_SIZE),
  });
  readonly silhouetteScene = new Scene();
  readonly depthScene = new Scene();
  /** Depth-only receiver pass (colour writes off). */
  readonly depthMaterial = new MeshBasicMaterial({
    colorWrite: false,
    side: DoubleSide,
  });
  readonly silhouetteCamera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  readonly blackMaterial = new MeshBasicMaterial({ color: 0x000000 });
  readonly decals = new Group();
  private readonly states = new Map<ShadowCaster, CasterState>();
  private readonly freeTiles: number[] = [];
  private readonly pending: CasterState[] = [];

  constructor() {
    this.decals.name = "ShadowPool";
    // Reachable from the scene graph for probes and debugging.
    this.decals.userData.atlas = this.atlas;
    for (let i = MAX_CASTERS - 1; i >= 0; i--) this.freeTiles.push(i);
  }

  dispose(): void {
    for (const state of this.states.values()) this.disposeState(state);
    this.states.clear();
    this.atlas.dispose();
    this.depthAtlas.dispose();
    this.blackMaterial.dispose();
    this.depthMaterial.dispose();
  }

  private disposeState(state: CasterState): void {
    const pendingIndex = this.pending.indexOf(state);
    if (pendingIndex >= 0) this.pending.splice(pendingIndex, 1);
    this.decals.remove(state.mesh);
    this.depthScene.remove(state.depthMesh);
    this.silhouetteScene.remove(state.proxyGroup);
    for (const stop of state.meshSubscriptions.values()) stop();
    state.geometry.dispose();
    state.material.dispose();
    if (state.tile >= 0) this.freeTiles.push(state.tile);
  }

  private ensureState(caster: ShadowCaster): CasterState | null {
    let state = this.states.get(caster);
    if (state) return state;
    const tile = this.freeTiles.pop();
    if (tile == null) return null;
    const geometry = createReceiverGeometry(INITIAL_RECEIVER_TRIANGLES);
    const material = createMaterial(this.atlas, this.depthAtlas);
    const [tileX, tileY] = tileOrigin(tile);
    material.uniforms.tile.value.set(
      tileX / ATLAS_SIZE,
      tileY / ATLAS_SIZE,
      TILE_SIZE / ATLAS_SIZE,
      1 / ATLAS_SIZE,
    );
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    mesh.renderOrder = SHADOW_RENDER_ORDER;
    this.decals.add(mesh);
    const depthMesh = new Mesh(geometry, this.depthMaterial);
    depthMesh.frustumCulled = false;
    depthMesh.matrixAutoUpdate = false;
    depthMesh.visible = false;
    this.depthScene.add(depthMesh);
    const proxyGroup = new Group();
    proxyGroup.visible = false;
    this.silhouetteScene.add(proxyGroup);
    state = {
      caster,
      proxyGroup,
      proxies: [],
      meshSubscriptions: new Map(),
      scannedAt: -Infinity,
      tile,
      lastRenderMs: -Infinity,
      geometry,
      material,
      mesh,
      lightToWorld: new Matrix4(),
      depthMesh,
      lastVisibleMs: 0,
      receiverInteriors: -1,
      receiverFrame: new Matrix4(),
      receiverRadius: NaN,
      receiverReach: NaN,
      hasReceivers: false,
      depthDirty: false,
    };
    this.states.set(caster, state);
    return state;
  }

  private syncProxies(state: CasterState, nowSec: number): void {
    if (
      nowSec - state.scannedAt < PROXY_RESCAN_SEC &&
      nowSec >= state.scannedAt
    ) {
      return;
    }
    state.scannedAt = nowSec;
    const sources: Mesh[] = [];
    collectMeshes(state.caster.root, sources);
    const shapes = new Set<DTSShape>();
    state.caster.root.traverse((node) => {
      if (!(node instanceof DTSShape)) return;
      shapes.add(node);
      if (!state.meshSubscriptions.has(node))
        state.meshSubscriptions.set(
          node,
          node.onMeshAdded(() => {
            state.scannedAt = -Infinity;
          }),
        );
    });
    for (const [shape, stop] of state.meshSubscriptions)
      if (!shapes.has(shape)) {
        stop();
        state.meshSubscriptions.delete(shape);
      }
    if (sameSources(state.proxies, sources)) return;
    state.proxyGroup.clear();
    state.proxies = sources.map((source) => {
      const proxy = createProxy(source, this.blackMaterial);
      state.proxyGroup.add(proxy);
      return { source, proxy };
    });
  }

  private writeReceivers(
    state: CasterState,
    windowRadius: number,
    reach: number,
  ): boolean {
    const world = collisionState();
    const interiors = interiorColliderVersion();
    if (
      state.receiverWorld === world &&
      state.receiverTerrain === world.terrain &&
      state.receiverInteriors === interiors &&
      state.receiverRadius === windowRadius &&
      state.receiverReach === reach &&
      state.receiverFrame.equals(state.lightToWorld)
    )
      return state.hasReceivers;
    state.receiverWorld = world;
    state.receiverTerrain = world.terrain;
    state.receiverInteriors = interiors;
    state.receiverRadius = windowRadius;
    state.receiverReach = reach;
    state.receiverFrame.copy(state.lightToWorld);
    _box.makeEmpty();
    for (let i = 0; i < 8; i++) {
      _corner.set(
        i & 1 ? windowRadius : -windowRadius,
        i & 2 ? reach : 0,
        i & 4 ? windowRadius : -windowRadius,
      );
      _box.expandByPoint(_corner.applyMatrix4(state.lightToWorld));
    }
    _positions.length = 0;
    _facing.dir.setFromMatrixColumn(state.lightToWorld, 1);
    terrainTrianglesInBox(
      _box.min.z,
      _box.min.x,
      _box.max.z,
      _box.max.x,
      _positions,
      _facing,
    );
    interiorTrianglesInBox(_box, _positions, _facing);
    state.hasReceivers = _positions.length > 0;
    state.depthDirty = state.hasReceivers;
    if (!state.hasReceivers) return false;
    let attribute = state.geometry.getAttribute("position") as BufferAttribute;
    if (attribute.array.length < _positions.length) {
      // Replace the geometry rather than the attribute so the old GPU
      // buffer is released with it.
      let capacity = attribute.array.length;
      while (capacity < _positions.length) capacity *= 2;
      state.geometry.dispose();
      state.geometry = createReceiverGeometry(capacity / 9);
      state.mesh.geometry = state.geometry;
      state.depthMesh.geometry = state.geometry;
      attribute = state.geometry.getAttribute("position") as BufferAttribute;
    }
    (attribute.array as Float32Array).set(_positions);
    attribute.addUpdateRange(0, _positions.length);
    attribute.needsUpdate = true;
    state.geometry.setDrawRange(0, _positions.length / 3);
    return true;
  }

  /** Runs from the scene's onBeforeRender: matrices are final for this frame. */
  update(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    const perspective = (camera as PerspectiveCamera).isPerspectiveCamera
      ? (camera as PerspectiveCamera)
      : null;
    const viewportHeight = renderer.getDrawingBufferSize(_viewportSize).y;
    const nowMs = performance.now();
    const nowSec = nowMs / 1000;
    const fog = scene.fog as Fog | null;
    for (const state of this.states.values()) {
      state.mesh.visible = false;
    }

    for (const caster of shadowCasters()) {
      if (
        !perspective ||
        !caster.enabled ||
        !(caster.radius > 0) ||
        caster.alpha <= 0 ||
        !isVisibleInHierarchy(caster.root)
      ) {
        continue;
      }
      _center.copy(caster.center).applyMatrix4(caster.root.matrixWorld);
      const radius =
        caster.radius * caster.root.matrixWorld.getMaxScaleOnAxis();
      const dist = camera.position.distanceTo(_center);
      const px = projectedRadiusPx(
        radius,
        dist,
        viewportHeight,
        perspective.fov,
      );
      const visibility = shadowVisibility(px);
      if (!visibility.visible) continue;
      const haze = fog ? hazeAndFog(dist, _center.y, fog.near, fog.far) : 0;
      const fade = Math.max(visibility.fade, haze);
      if (fade >= FADE_CUTOFF) continue;
      // Tiles, materials and proxies exist only for casters that draw.
      const state = this.ensureState(caster);
      if (!state) continue;
      // A hidden shadow retains its tile. Receiver/projection changes below
      // invalidate it; visibility alone doesn't require another depth pass.
      state.lastVisibleMs = nowMs;
      const spec = shadowTileSpec(px);
      const generic = spec.size === 0;
      const reach =
        SHADOW_REACH_FACTOR * radius * (1 - shadowDistanceFade(dist).reachLoss);
      const windowRadius = generic
        ? radius * SHADOW_GENERIC_RADIUS_SCALE
        : radius;
      shadowLightDir(dist, _dir);
      shadowLightToWorld(_dir, _center, state.lightToWorld);
      if (!this.writeReceivers(state, windowRadius, reach)) continue;

      const u = state.material.uniforms;
      u.worldToLight.value.copy(state.lightToWorld).invert();
      u.radius.value = windowRadius;
      u.reach.value = reach;
      u.fadeScale.value = 1 - fade;
      u.objectAlpha.value = Math.min(1, caster.alpha);
      u.blur.value = spec.blur ? 1 : 0;
      u.generic.value = generic ? 1 : 0;
      state.mesh.visible = true;

      if (!generic) {
        this.syncProxies(state, nowSec);
        if (
          (state.lastRenderMs === -Infinity ||
            nowMs - state.lastRenderMs >= spec.intervalMs) &&
          !this.pending.includes(state)
        ) {
          state.lastRenderMs = nowMs;
          this.pending.push(state);
        }
      }
    }

    for (const [caster, state] of this.states) {
      if (
        !shadowCasters().has(caster) ||
        nowMs - state.lastVisibleMs > IDLE_RELEASE_MS
      ) {
        this.disposeState(state);
        this.states.delete(caster);
      }
    }
  }

  /**
   * Runs from useFrame, between frames: Three's render() wraps the
   * scene in its own output pass, so render targets cannot be switched
   * from inside onBeforeRender. The silhouettes therefore use the
   * previous frame's transforms — invisible at their 25–100 ms cadence.
   */
  renderPending(renderer: WebGLRenderer): void {
    let depthPending = false;
    for (const state of this.states.values()) {
      if (state.mesh.visible && state.depthDirty) {
        depthPending = true;
        break;
      }
    }
    if (!depthPending && this.pending.length === 0) return;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(_clearColor);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    // Tiles are addressed through the target's own viewport/scissor:
    // renderer.setViewport would redefine the default framebuffer's
    // viewport (and apply the pixel ratio).
    this.atlas.scissorTest = true;
    this.depthAtlas.scissorTest = true;
    const camera = this.silhouetteCamera;
    this.renderReceiverDepth(renderer, camera);
    for (const state of this.pending) {
      const radius = state.material.uniforms.radius.value as number;
      _center.setFromMatrixPosition(state.lightToWorld);
      _dir.setFromMatrixColumn(state.lightToWorld, 1);
      _zAxis.setFromMatrixColumn(state.lightToWorld, 2);
      camera.left = -radius;
      camera.right = radius;
      camera.top = radius;
      camera.bottom = -radius;
      camera.near = 0.01;
      camera.far = 4 * radius;
      camera.updateProjectionMatrix();
      camera.position.copy(_center).addScaledVector(_dir, -2 * radius);
      camera.up.copy(_zAxis);
      camera.lookAt(_center);
      camera.updateMatrixWorld(true);
      for (const { source, proxy } of state.proxies) {
        // Native DTS instances allocate their mutable geometry on first use.
        proxy.geometry = source.geometry;
        proxy.visible = isVisibleInHierarchy(source);
      }
      state.proxyGroup.visible = true;
      const [x, y] = tileOrigin(state.tile);
      this.atlas.viewport.set(x, y, TILE_SIZE, TILE_SIZE);
      this.atlas.scissor.set(x, y, TILE_SIZE, TILE_SIZE);
      renderer.setRenderTarget(this.atlas);
      renderer.clear(true, false, false);
      renderer.render(this.silhouetteScene, camera);
      state.proxyGroup.visible = false;
    }
    this.pending.length = 0;
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(_clearColor, previousClearAlpha);
    renderer.autoClear = previousAutoClear;
  }

  /**
   * Depth of last frame's receivers from the light, per visible caster:
   * the ortho camera sits at the light-space origin looking along the
   * light, near 0 and far = reach, so the stored depth is y / reach. The
   * decal keeps the frame it was rendered in (worldToLightDepth) so the
   * comparison stays self-consistent while the caster moves.
   */
  private renderReceiverDepth(
    renderer: WebGLRenderer,
    camera: OrthographicCamera,
  ): void {
    for (const state of this.states.values()) {
      if (!state.mesh.visible || !state.depthDirty) continue;
      const u = state.material.uniforms;
      const radius = u.radius.value as number;
      const reach = u.reach.value as number;
      _center.setFromMatrixPosition(state.lightToWorld);
      _dir.setFromMatrixColumn(state.lightToWorld, 1);
      _zAxis.setFromMatrixColumn(state.lightToWorld, 2);
      camera.left = -radius;
      camera.right = radius;
      camera.top = radius;
      camera.bottom = -radius;
      camera.near = 0;
      camera.far = reach;
      camera.updateProjectionMatrix();
      camera.position.copy(_center);
      camera.up.copy(_zAxis);
      camera.lookAt(_corner.copy(_center).add(_dir));
      camera.updateMatrixWorld(true);
      state.depthMesh.visible = true;
      const [x, y] = tileOrigin(state.tile);
      this.depthAtlas.viewport.set(x, y, TILE_SIZE, TILE_SIZE);
      this.depthAtlas.scissor.set(x, y, TILE_SIZE, TILE_SIZE);
      renderer.setRenderTarget(this.depthAtlas);
      renderer.clear(false, true, false);
      renderer.render(this.depthScene, camera);
      state.depthMesh.visible = false;
      u.worldToLightDepth.value.copy(state.lightToWorld).invert();
      u.depthRadius.value = radius;
      u.depthReach.value = reach;
      u.hasDepth.value = 1;
      state.depthDirty = false;
    }
  }
}
