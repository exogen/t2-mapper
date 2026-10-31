import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CubeTextureLoader,
  Group,
  Mesh,
  ShaderMaterial,
  Vector4,
  type Camera,
  type CubeTexture,
  type IUniform,
  type Object3D,
} from "three";
import { FALLBACK_TEXTURE_URL, textureToUrl } from "../loaders";
import { createLogger } from "../logger";
import type { Color3, SceneSky } from "../scene/types";
import {
  resetShapeEnvMap,
  setShapeEnvMap,
  shapeEnvMapUniforms,
} from "../shapeMaterial";
import { glslColorSpace } from "../shaderUtils";
import { computeSkyFogBands, skyFogAlphaGlsl } from "../skyFogBands";
import { commandCircuitStore } from "../state/commandCircuitStore";
import type { SkyEntity } from "../state/gameEntityTypes";
import {
  selectDebugMode,
  selectFogEnabled,
  settingsStore,
} from "../state/settingsStore";
import { loadTexture, setupTexture } from "../textureUtils";
import { startCloudLayers } from "./cloudLayers";
import { loadSharedDetailMapList } from "./detailMapList";
import { createDynamicFog } from "./dynamicFog";
import type { EntityView } from "./entityViews";
import { fogStateFromScene, type FogState } from "./fogState";
import { FramePriority } from "./framePriority";
import { combineCleanups, reaction } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

const log = createLogger("Sky");

/**
 * Convert a Color3 to [sRGB Color, linear Color].
 */
function color3ToThree(c: Color3): [Color, Color] {
  return [
    new Color().setRGB(c.r, c.g, c.b),
    new Color().setRGB(c.r, c.g, c.b).convertSRGBToLinear(),
  ];
}

/**
 * What the sky follows besides its own data: the viewer's fog setting
 * and the command circuit's top-down view, which disables fog and the
 * sky domes.
 */
interface SkyMode {
  fogSetting: boolean;
  commandCircuit: boolean;
}

function readSkyMode(): SkyMode {
  return {
    fogSetting: selectFogEnabled(settingsStore.getState()),
    commandCircuit: commandCircuitStore.getState().active,
  };
}

/**
 * The settings and command circuit stores as one, for `reaction`.
 */
const skyModeStore = {
  getState: readSkyMode,
  subscribe(listener: (state: SkyMode, previous: SkyMode) => void) {
    let previous = readSkyMode();
    const notify = () => {
      const state = readSkyMode();
      const last = previous;
      previous = state;
      listener(state, last);
    };
    return combineCleanups(
      settingsStore.subscribe(notify),
      commandCircuitStore.subscribe(notify),
    );
  },
};

/**
 * Whether the scene is fogged: the viewer's setting, off in the command
 * circuit.
 */
function selectSceneFog(mode: SkyMode): boolean {
  return mode.fogSetting && !mode.commandCircuit;
}

const cubeTextureLoader = new CubeTextureLoader();
const cubeTextures = new Map<string, Promise<CubeTexture>>();

/**
 * Load a sky box's cube map once per face list and share it.
 * CubeTextureLoader marks it sRGB, so the shader samples linear values.
 */
function loadSharedCubeTexture(files: readonly string[]): Promise<CubeTexture> {
  const key = files.join("\n");
  let promise = cubeTextures.get(key);
  if (!promise) {
    promise = cubeTextureLoader.loadAsync(files);
    // A failed sky box can be retried later.
    promise.catch(() => cubeTextures.delete(key));
    cubeTextures.set(key, promise);
  }
  return promise;
}

const NO_FOG_COLOR = new Color(0, 0, 0);

const skyVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

/**
 * What both sky shaders share: the view ray through each pixel and the
 * fogged sky color in display space.
 */
const skyFragmentCommon = `
  uniform vec3 fogColor;
  uniform bool enableFog;
  uniform mat4 inverseProjectionMatrix;
  uniform mat4 cameraMatrixWorld;

  varying vec2 vUv;

  ${skyFogAlphaGlsl}

  // Convert linear to sRGB for display
  // shaderMaterial does NOT get automatic linear->sRGB output conversion
  // Use proper sRGB transfer function (not simplified gamma 2.2) to match Three.js
  ${glslColorSpace}

  vec3 skyRayDirection() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 viewPos = inverseProjectionMatrix * vec4(ndc, 1.0, 1.0);
    viewPos.xyz /= viewPos.w;
    vec3 direction = normalize((cameraMatrixWorld * vec4(viewPos.xyz, 0.0)).xyz);
    return vec3(direction.z, direction.y, -direction.x);
  }

  vec4 skyFragColor(vec3 linearSkyColor, vec3 direction) {
    vec3 finalColor;
    if (enableFog) {
      // Tribes2.exe fog/sky boundary (Sky::renderSkyBox, 0x5acb20):
      // the sky is painted fog color, skybox walls are clipped to
      // above the saturation ring, and two alpha-graded pieces of
      // band geometry blend the transition. skyFogAlpha evaluates
      // the same bands analytically per ray.
      float finalFogFactor = skyFogAlpha(direction);
      // Fixed-function GL blended the display-encoded colors.
      finalColor = mix(torqueLinearToSRGB(linearSkyColor), torqueLinearToSRGB(fogColor), finalFogFactor);
    } else {
      finalColor = torqueLinearToSRGB(linearSkyColor);
    }
    // The blend is already in display space.
    return vec4(finalColor, 1.0);
  }
`;

const skyBoxFragmentShader = `
  uniform samplerCube skybox;

  ${skyFragmentCommon}

  void main() {
    vec3 direction = skyRayDirection();
    // Sample skybox - Three.js CubeTexture with SRGBColorSpace auto-converts to linear
    gl_FragColor = skyFragColor(textureCube(skybox, direction).rgb, direction);
  }
`;

/**
 * Solid color sky for when useSkyTextures = 0: SkySolidColor (ignoring
 * alpha) with fog at the horizon, using the same fog logic as the sky box.
 */
const solidColorFragmentShader = `
  uniform vec3 skyColor;

  ${skyFragmentCommon}

  void main() {
    gl_FragColor = skyFragColor(skyColor, skyRayDirection());
  }
`;

/**
 * Per-frame sky material updates, shared by both sky shaders. The camera
 * matrices must come from the CURRENT render camera — a camera captured
 * when the sky is built can be the command circuit's ortho camera, which
 * breaks the ray unprojection permanently. The fog bands depend on the
 * camera height, so they update here too.
 */
function updateSkyFrameUniforms(
  u: Record<string, IUniform>,
  renderCamera: Camera,
  fogState: FogState | undefined,
): void {
  u.inverseProjectionMatrix.value = renderCamera.projectionMatrixInverse;
  u.cameraMatrixWorld.value = renderCamera.matrixWorld;
  if (fogState) {
    const bands = computeSkyFogBands(
      fogState.visibleDistance,
      fogState.fogVolumes,
      renderCamera.position.y,
    );
    (u.fogBands.value as Vector4).set(
      bands.h0,
      bands.h1,
      bands.alpha0,
      bands.alpha1,
    );
    u.skyRadius.value = bands.radius;
  }
}

interface SkyDome {
  mesh: Mesh<BufferGeometry, ShaderMaterial>;
  /**
   * Follow the render camera and the fog (undefined while it's off).
   */
  update(renderCamera: Camera, fogState: FogState | undefined): void;
  dispose(): void;
}

/**
 * A screen-covering triangle at the far plane that unprojects each pixel
 * to its view ray and paints the sky in that direction.
 */
function createSkyDome(
  fragmentShader: string,
  skyUniforms: Record<string, IUniform>,
  camera: Camera,
  fogState: FogState | undefined,
): SkyDome {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  geometry.setAttribute(
    "uv",
    new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2),
  );
  const material = new ShaderMaterial({
    uniforms: {
      ...skyUniforms,
      fogColor: { value: fogState?.fogColor ?? NO_FOG_COLOR },
      enableFog: { value: !!fogState },
      inverseProjectionMatrix: { value: camera.projectionMatrixInverse },
      cameraMatrixWorld: { value: camera.matrixWorld },
      fogBands: { value: new Vector4(0, 60, 0, 0) },
      skyRadius: { value: 300 },
    },
    vertexShader: skyVertexShader,
    fragmentShader,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(renderCamera, fog) {
      const u = material.uniforms;
      u.fogColor.value = fog?.fogColor ?? NO_FOG_COLOR;
      u.enableFog.value = !!fog;
      updateSkyFrameUniforms(u, renderCamera, fog);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Draw `dome` (once it exists) through each frame's render camera.
 */
function updateDomeEachFrame(
  engine: GameEngine,
  dome: () => SkyDome | null,
  currentFog: () => FogState | undefined,
): () => void {
  return engine.scheduler.add(FramePriority.PostCamera, ({ camera }) =>
    dome()?.update(camera, currentFog()),
  );
}

/**
 * Load the sphere-map environment texture (index 6 in the .dml) for shape
 * reflections. This is a dedicated 2D texture, NOT the skybox cubemap.
 * Some maps have broken emap paths (e.g. Katabatic references desert/skies/
 * but file is at ice/skies/) — skip if the texture doesn't resolve.
 */
function startShapeEnvMap(emapName: string | undefined): () => void {
  if (!emapName) return () => {};
  const url = textureToUrl(emapName);
  // textureToUrl returns the fallback URL for missing textures (e.g.
  // Katabatic's DML has a broken emap path). Don't set a fallback as envmap.
  if (url === FALLBACK_TEXTURE_URL) return () => {};
  // The reflection shader blends raw sRGB samples with the lit base color.
  let active = true;
  loadTexture(url, (loaded) => {
    // A previous map's pending load must not replace the current sky.
    if (!active) return;
    setupTexture(loaded, { noColorSpace: true });
    setShapeEnvMap(loaded);
  });
  return () => {
    active = false;
    resetShapeEnvMap();
  };
}

/**
 * The textured sky box from the mission's .dml: drawn once the list and
 * all six faces have loaded (the scene background shows until then),
 * plus the shapes' environment map.
 */
function startSkyBox(
  engine: GameEngine,
  parent: Object3D,
  materialList: string,
  currentFog: () => FogState | undefined,
): () => void {
  let active = true;
  let dome: SkyDome | null = null;
  let stopEnvMap: (() => void) | null = null;

  void loadSharedDetailMapList(materialList).then(
    (detailMapList) => {
      if (!active) return;
      stopEnvMap = startShapeEnvMap(detailMapList[6]);
      const skyBoxFiles = [
        textureToUrl(detailMapList[1]!), // +x
        textureToUrl(detailMapList[3]!), // -x
        textureToUrl(detailMapList[4]!), // +y
        textureToUrl(detailMapList[5]!), // -y
        textureToUrl(detailMapList[0]!), // +z
        textureToUrl(detailMapList[2]!), // -z
      ];
      void loadSharedCubeTexture(skyBoxFiles).then(
        (skyBox) => {
          if (!active) return;
          dome = createSkyDome(
            skyBoxFragmentShader,
            { skybox: { value: skyBox } },
            engine.cameras.active,
            currentFog(),
          );
          parent.add(dome.mesh);
          engine.invalidate();
        },
        (error: unknown) => {
          if (!active) return;
          log.warn("sky box %s failed: %o", materialList, error);
        },
      );
    },
    // No list, no sky box (the failure is logged where it's loaded).
    () => {},
  );

  return combineCleanups(
    () => {
      active = false;
      if (dome) {
        parent.remove(dome.mesh);
        dome.dispose();
        dome = null;
      }
      stopEnvMap?.();
    },
    // In debug mode, show sphere map UVs as colors instead of the texture.
    // Left as it is when the sky box goes.
    reaction(settingsStore, selectDebugMode, (debugMode) => {
      shapeEnvMapUniforms.shapeEnvMapDebugUV.value = debugMode;
    }),
    updateDomeEachFrame(engine, () => dome, currentFog),
  );
}

/**
 * The solid color sky (useSkyTextures = 0), drawn right away.
 */
function startSolidColorSky(
  engine: GameEngine,
  parent: Object3D,
  skyColor: Color,
  currentFog: () => FogState | undefined,
): () => void {
  const dome = createSkyDome(
    solidColorFragmentShader,
    { skyColor: { value: skyColor } },
    engine.cameras.active,
    currentFog(),
  );
  parent.add(dome.mesh);
  return combineCleanups(
    () => {
      parent.remove(dome.mesh);
      dome.dispose();
    },
    updateDomeEachFrame(engine, () => dome, currentFog),
  );
}

function sameSkyData(a: SceneSky, b: SceneSky): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * A mission's Sky: the scene background (fog or sky color), the sky box
 * or solid color sky, its cloud layers, and Torque-style fog. The sky
 * draws its color right away; the sky box and each cloud layer appear as
 * their textures load.
 */
export function createSkyView(
  entity: SkyEntity,
  engine: GameEngine,
): EntityView {
  const { skyData } = entity;
  log.debug(
    "Rendering: materialList=%s, useSkyTextures=%s",
    skyData.materialList,
    skyData.useSkyTextures,
  );
  const root = new Group();
  root.name = entity.id;

  // Skybox textures
  const materialList = skyData.materialList || undefined;
  const useSkyTextures = skyData.useSkyTextures;

  const [skySolidColor, linearSkySolidColor] = color3ToThree(
    skyData.skySolidColor,
  );

  // Parse full fog state from typed scene sky
  const fogState = fogStateFromScene(skyData);

  log.debug(
    "fogState: fogColor=(%s, %s, %s) visibleDistance=%d fogDistance=%d enabled=%s volumes=%d",
    skyData.fogColor.r.toFixed(3),
    skyData.fogColor.g.toFixed(3),
    skyData.fogColor.b.toFixed(3),
    skyData.visibleDistance,
    skyData.fogDistance,
    fogState.enabled,
    fogState.fogVolumes.length,
  );

  // Only fog the sky if we have valid distance parameters
  const selectHasFogParams = (mode: SkyMode) =>
    fogState.enabled && selectSceneFog(mode);
  let skyFog: FogState | undefined;
  const currentFog = () => skyFog;

  // Always run the fog when the mission has fog params. Toggling it only
  // pushes it out of range — this avoids shader recompilation (USE_FOG
  // stays defined, but fog.near/far disable fog).
  const fog = fogState.enabled
    ? createDynamicFog(engine, fogState, selectSceneFog(readSkyMode()))
    : null;

  const startSkyContent = () =>
    combineCleanups(
      materialList && useSkyTextures
        ? startSkyBox(engine, root, materialList, currentFog)
        : startSolidColorSky(engine, root, linearSkySolidColor, currentFog),
      // Cloud layers render independently of skybox textures
      startCloudLayers(engine, root, skyData, currentFog),
      () => engine.invalidate(),
    );

  return {
    root,
    // Identical sky data (a rebuilt identity) keeps what's drawn.
    update: (next) =>
      next.renderType === "Sky" && sameSkyData(next.skyData, skyData),
    dispose: combineCleanups(
      () => fog?.dispose(),
      reaction(skyModeStore, selectSceneFog, (enabled) => {
        fog?.setEnabled(enabled);
        engine.invalidate();
      }),
      reaction(skyModeStore, selectHasFogParams, (hasFogParams) => {
        skyFog = hasFogParams ? fogState : undefined;
      }),
      // Set the scene background color directly, so the gap between
      // fogged terrain and the sky box blends correctly.
      engine.withHost(({ scene, renderer }) =>
        reaction(skyModeStore, selectHasFogParams, (hasFogParams) => {
          // Use the linear fog color from fogState (matches terrain fog);
          // three.js handles the display conversion.
          const bgColor = hasFogParams
            ? fogState.fogColor.clone()
            : skySolidColor.clone();
          scene.background = bgColor;
          // Also set the renderer clear color as a fallback
          renderer.setClearColor(bgColor);
          engine.invalidate();
          return () => {
            scene.background = null;
          };
        }),
      ),
      // The camera-centered sky domes and clouds render as garbage from
      // the command circuit's top-down orthographic view; the scene
      // background (sky color) fills the frame instead.
      reaction(
        skyModeStore,
        (mode) => mode.commandCircuit,
        (commandCircuit) => (commandCircuit ? undefined : startSkyContent()),
      ),
    ),
  };
}
