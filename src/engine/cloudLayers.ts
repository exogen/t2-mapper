import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  Mesh,
  NoColorSpace,
  RepeatWrapping,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Object3D,
  type Texture,
} from "three";
import { textureToUrl } from "../loaders";
import { createLogger } from "../logger";
import { skyCloudStormFrame } from "../scene/skyWeather";
import type { SceneSky } from "../scene/types";
import { computeSkyFogBands, skyFogAlphaGlsl } from "../skyFogBands";
import { worldDeltaSec } from "../state/engineStore";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import { loadSharedDetailMapList, type DetailMapList } from "./detailMapList";
import type { FogState } from "./fogState";
import { FramePriority } from "./framePriority";
import { combineCleanups, reaction } from "./storeReaction";
import { loadTextures } from "./textures";
import type { GameEngine } from "./gameEngine";

const log = createLogger("CloudLayers");

/**
 * Right after the sky dome (renderOrder −1000), ahead of all scene effects.
 */
const CLOUD_RENDER_ORDER = -990;

const GRID_SIZE = 5;
const VERTEX_COUNT = GRID_SIZE * GRID_SIZE;

/**
 * Cloud edge height as percentage of radius.
 * From Tribes 2 sky.cc line 160: setHeights(cloudHeightPer[i], cloudHeightPer[i]-0.05f, 0.05f)
 * Edge height is always 0.05, while center/inner heights vary per layer.
 */
const EDGE_HEIGHT = 0.05;

/**
 * Height values for each vertex in the 5x5 grid.
 * Matches the zValue array from Tribes 2 Cloud::setPoints()
 */
function getHeightValues(
  centerHeight: number,
  innerHeight: number,
  edgeHeight: number,
): number[] {
  const c = centerHeight;
  const i = innerHeight;
  const e = edgeHeight;

  // prettier-ignore
  return [
    e, e, e, e, e,  // Row 0 (top edge)
    e, i, i, i, e,  // Row 1
    e, i, c, i, e,  // Row 2 (center)
    e, i, i, i, e,  // Row 3
    e, e, e, e, e,  // Row 4 (bottom edge)
  ];
}

/**
 * Calculate per-vertex alpha values.
 * From Tribes 2 Cloud::calcAlpha() - fades based on distance from center.
 * Uses the exact algorithm from TorqueSDK-1.2/engine/terrain/sky.cc
 */
function calculateAlphaValues(
  positions: Float32Array,
  radius: number,
): Float32Array {
  const alphas = new Float32Array(VERTEX_COUNT);

  for (let i = 0; i < VERTEX_COUNT; i++) {
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    // Distance from vertical axis (X/Z plane in Three.js, ignoring Y height)
    // Matches: (mPoints[i] - Point3F(0, 0, mPoints[i].z)).len()
    const dist = Math.sqrt(x * x + z * z);

    // From Tribes 2: alpha = 1.3 - dist/radius
    let alpha = 1.3 - dist / radius;

    // Clamp and threshold (exact values from Tribes 2)
    if (alpha < 0.4) {
      alpha = 0.0;
    } else if (alpha > 0.8) {
      alpha = 1.0;
    }

    alphas[i] = alpha;
  }

  return alphas;
}

/**
 * Create the cloud dome geometry as a 5x5 grid of vertices.
 * Matches Tribes 2 Cloud::setPoints()
 */
function createCloudGeometry(
  radius: number,
  centerHeight: number,
  innerHeight: number,
  edgeHeight: number,
): BufferGeometry {
  const geometry = new BufferGeometry();

  const positions = new Float32Array(VERTEX_COUNT * 3);
  const uvs = new Float32Array(VERTEX_COUNT * 2);
  const heightValues = getHeightValues(centerHeight, innerHeight, edgeHeight);

  // Grid spacing
  const step = (radius * 2) / (GRID_SIZE - 1);

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const idx = row * GRID_SIZE + col;

      // Position: from -radius to +radius in X/Z plane (Three.js Y-up)
      const x = -radius + col * step;
      const z = radius - row * step; // Z goes from +radius to -radius
      const y = radius * heightValues[idx]; // Y is up in Three.js

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;

      // UV coordinates for texture (will be offset for scrolling)
      // Torque uses mTextureScale default of (1, 1), which with x/y going 0-4
      // gives UV range 0-4, tiling the texture 4 times across the dome.
      // This creates the swirly detail effect visible in Tribes 2.
      uvs[idx * 2] = col; // 0 to 4 (tiles 4x)
      uvs[idx * 2 + 1] = row; // 0 to 4 (tiles 4x)
    }
  }

  // Adjust corner vertices to smooth the dome (from Tribes 2 Cloud::setPoints)
  // This makes the corners lie on a plane with their neighbors
  adjustCorners(positions);

  // Calculate alpha values based on distance from center
  const alphas = calculateAlphaValues(positions, radius);

  // Create indices for the 4x4 grid of quads (each as 2 triangles)
  const indices: number[] = [];
  for (let row = 0; row < GRID_SIZE - 1; row++) {
    for (let col = 0; col < GRID_SIZE - 1; col++) {
      const topLeft = row * GRID_SIZE + col;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + GRID_SIZE;
      const bottomRight = bottomLeft + 1;

      // Two triangles per quad
      indices.push(topLeft, bottomLeft, bottomRight);
      indices.push(topLeft, bottomRight, topRight);
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("alpha", new Float32BufferAttribute(alphas, 1));

  // Compute bounding sphere for proper frustum culling
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Adjust corner vertices to create a smoother dome.
 * From Tribes 2 Cloud::setPoints() corner adjustment logic.
 * Note: In Three.js, Y is up, so we use x/z for horizontal and y for height.
 */
function adjustCorners(positions: Float32Array): void {
  // Helper to get/set position (x, y, z where y is up in Three.js)
  const getPos = (idx: number) => ({
    x: positions[idx * 3],
    y: positions[idx * 3 + 1], // height (up)
    z: positions[idx * 3 + 2],
  });
  const setPos = (idx: number, x: number, y: number, z: number) => {
    positions[idx * 3] = x;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = z;
  };

  // Corner indices
  const TL = 0;
  const TR = 4;
  const BL = 20;
  const BR = 24;
  // Adjacent indices for corner adjustment
  const p1 = getPos(1);
  const p3 = getPos(3);
  const p5 = getPos(5);
  const p6 = getPos(6);
  const p8 = getPos(8);
  const p9 = getPos(9);
  const p15 = getPos(15);
  const p16 = getPos(16);
  const p18 = getPos(18);
  const p19 = getPos(19);
  const p21 = getPos(21);
  const p23 = getPos(23);

  // Top-left corner (index 0)
  // vec = (p5 + (p1 - p5) * 0.5) - p6; p0 = p6 + vec * 2
  let midX = p5.x + (p1.x - p5.x) * 0.5;
  let midY = p5.y + (p1.y - p5.y) * 0.5;
  let midZ = p5.z + (p1.z - p5.z) * 0.5;
  setPos(
    TL,
    p6.x + (midX - p6.x) * 2,
    p6.y + (midY - p6.y) * 2,
    p6.z + (midZ - p6.z) * 2,
  );

  // Top-right corner (index 4)
  // vec = (p9 + (p3 - p9) * 0.5) - p8; p4 = p8 + vec * 2
  midX = p9.x + (p3.x - p9.x) * 0.5;
  midY = p9.y + (p3.y - p9.y) * 0.5;
  midZ = p9.z + (p3.z - p9.z) * 0.5;
  setPos(
    TR,
    p8.x + (midX - p8.x) * 2,
    p8.y + (midY - p8.y) * 2,
    p8.z + (midZ - p8.z) * 2,
  );

  // Bottom-left corner (index 20)
  // vec = (p21 + (p15 - p21) * 0.5) - p16; p20 = p16 + vec * 2
  midX = p21.x + (p15.x - p21.x) * 0.5;
  midY = p21.y + (p15.y - p21.y) * 0.5;
  midZ = p21.z + (p15.z - p21.z) * 0.5;
  setPos(
    BL,
    p16.x + (midX - p16.x) * 2,
    p16.y + (midY - p16.y) * 2,
    p16.z + (midZ - p16.z) * 2,
  );

  // Bottom-right corner (index 24)
  // vec = (p23 + (p19 - p23) * 0.5) - p18; p24 = p18 + vec * 2
  midX = p23.x + (p19.x - p23.x) * 0.5;
  midY = p23.y + (p19.y - p23.y) * 0.5;
  midZ = p23.z + (p19.z - p23.z) * 0.5;
  setPos(
    BR,
    p18.x + (midX - p18.x) * 2,
    p18.y + (midY - p18.y) * 2,
    p18.z + (midZ - p18.z) * 2,
  );
}

/**
 * Setup cloud texture with proper wrapping and filtering.
 * Uses NoColorSpace to pass values through directly without conversion,
 * matching Torque's gamma-space rendering pipeline.
 */
function setupCloudTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  // NoColorSpace: values pass through directly without sRGB conversion.
  // Torque didn't do color space conversion - textures went straight to display.
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
}

/**
 * Vertex shader for cloud layer.
 * Passes through position, UV (with offset for scrolling), and alpha.
 * Uses xyww trick to render at far plane like skybox.
 */
const cloudVertexShader = `
  attribute float alpha;

  uniform vec2 uvOffset;
  uniform vec2 stormCenter;
  uniform float stormRadius;
  uniform float stormFade;
  uniform bool stormActive;

  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vEyeRay;

  void main() {
    // Apply UV offset for scrolling
    vUv = uv + uvOffset;
    vAlpha = alpha;
    if (stormActive) {
      vec3 stormPoint = position / stormRadius;
      stormPoint.xz -= stormCenter;
      float radialAlpha = max(0.0, 1.0 - length(stormPoint));
      vAlpha *= stormFade < 0.0
        ? max(radialAlpha, -stormFade)
        : min(1.0, radialAlpha + stormFade);
    }
    // The cloud group is camera-centered, so the local position is the
    // eye ray — used to evaluate the sky fog bands per fragment.
    vEyeRay = position;

    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // Set depth to far plane so clouds are always visible and behind other geometry
    gl_Position = pos.xyww;
  }
`;

/**
 * Fragment shader for cloud layer.
 * Samples texture and applies per-vertex alpha for edge fading.
 * Cloud textures in Tribes 2 use the texture's brightness for transparency.
 */
const cloudFragmentShader = `
  uniform sampler2D cloudTexture;
  uniform float debugMode;
  uniform int layerIndex;
  uniform vec3 cloudFogColor;
  uniform bool cloudFogEnabled;

  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vEyeRay;

  ${skyFogAlphaGlsl}

  // Debug grid using screen-space derivatives for sharp, anti-aliased lines
  float debugGrid(vec2 uv, float gridSize, float lineWidth) {
    vec2 scaledUV = uv * gridSize;
    vec2 grid = abs(fract(scaledUV - 0.5) - 0.5) / fwidth(scaledUV);
    float line = min(grid.x, grid.y);
    return 1.0 - min(line / lineWidth, 1.0);
  }

  void main() {
    vec4 texColor = texture2D(cloudTexture, vUv);

    // Tribes 2 uses GL_MODULATE: final = texture × vertex color
    // Vertex color is white with varying alpha, so:
    // Final RGB = Texture RGB × 1.0 = Texture RGB
    // Final Alpha = Texture Alpha × Vertex Alpha
    float finalAlpha = texColor.a * vAlpha;
    vec3 color = texColor.rgb;

    // Debug mode: overlay R/G/B grid for layers 0/1/2
    if (debugMode > 0.5) {
      float gridIntensity = debugGrid(vUv, 4.0, 1.5);
      vec3 gridColor;
      if (layerIndex == 0) {
        gridColor = vec3(1.0, 0.0, 0.0); // Red
      } else if (layerIndex == 1) {
        gridColor = vec3(0.0, 1.0, 0.0); // Green
      } else {
        gridColor = vec3(0.0, 0.0, 1.0); // Blue
      }
      color = mix(color, gridColor, gridIntensity * 0.5);
    }

    // Tribes2.exe renders the fog bands OVER the clouds
    // (Sky::renderSkyBox: walls -> clouds -> band strip/fan), and clips
    // cloud quads below the fog line. Blending each fragment toward the
    // fog color by the band alpha reproduces both: at the fog line the
    // cloud matches the fog backdrop exactly and vanishes.
    if (cloudFogEnabled) {
      float band = skyFogAlpha(normalize(vEyeRay));
      color = mix(color, cloudFogColor, band);
    }
    // Keep cloud alpha: the backdrop already contains the same fog blend.
    // Attenuating alpha here as well would fade the cloud twice.

    // Output clouds with texture color and combined alpha
    gl_FragColor = vec4(color, finalAlpha);
  }
`;

/**
 * Sky fog band uniforms shared by all cloud layers, updated once per
 * frame. Safe to share by reference: each layer's material is built with
 * these very objects.
 */
interface CloudBandUniforms {
  fogBands: { value: Vector4 };
  skyRadius: { value: number };
  cloudFogColor: { value: Vector3 };
  cloudFogEnabled: { value: boolean };
}

interface CloudLayerConfig {
  texture: string;
  height: number;
  speed: number;
}

/**
 * DML file indices:
 * 0-5: Skybox faces
 * 6: Environment map
 * 7+: Cloud layer textures
 */
const CLOUD_TEXTURE_START_INDEX = 7;

/**
 * Extract cloud layer configurations from the DML (indices 7+).
 */
function cloudLayerConfigs(
  detailMapList: DetailMapList,
  scene: SceneSky,
): CloudLayerConfig[] {
  const result: CloudLayerConfig[] = [];
  for (let i = 0; i < 3; i++) {
    const texture = detailMapList[CLOUD_TEXTURE_START_INDEX + i];
    if (texture) {
      result.push({
        texture,
        height: scene.cloudLayers[i]?.heightPercent ?? [0.35, 0.25, 0.2][i],
        speed: scene.cloudLayers[i]?.speed ?? [0.0001, 0.0002, 0.0003][i],
      });
    }
  }
  return result;
}

/**
 * Wind direction from windVelocity.
 * Torque uses Z-up with windVelocity (x, y, z) where Y is forward.
 * Our cloud geometry has UV U along world X, UV V along world Z.
 * Rotate 90 degrees clockwise to match Torque's coordinate system.
 */
function cloudWindDirection(scene: SceneSky, direction: Vector2): Vector2 {
  const { x, y } = scene.weather?.renderWind ?? scene.windVelocity;
  // Rotate 90 degrees clockwise: (x, y) -> (y, -x).
  return direction.set(y, -x).normalize();
}

interface CloudLayer {
  mesh: Mesh<BufferGeometry, ShaderMaterial>;
  speed: number;
  index: number;
  /**
   * The scroll offset, wrapped to [0, 1).
   */
  offset: Vector2;
}

/**
 * A single cloud layer's domed mesh, once its texture has loaded.
 */
function createCloudLayer(
  texture: Texture,
  config: CloudLayerConfig,
  radius: number,
  layerIndex: number,
  bandUniforms: CloudBandUniforms,
): CloudLayer {
  // Create geometry with height based on layer
  // From Tribes 2 sky.cc line 160: setHeights(cloudHeightPer[i], cloudHeightPer[i]-0.05f, 0.05f)
  const geometry = createCloudGeometry(
    radius,
    config.height,
    config.height - 0.05,
    EDGE_HEIGHT,
  );
  const material = new ShaderMaterial({
    uniforms: {
      cloudTexture: { value: texture },
      uvOffset: { value: new Vector2(0, 0) },
      stormCenter: { value: new Vector2(0, 0) },
      stormRadius: { value: radius },
      stormFade: { value: 0 },
      stormActive: { value: false },
      debugMode: { value: selectDebugMode(settingsStore.getState()) ? 1 : 0 },
      layerIndex: { value: layerIndex },
      // Shared objects — live-updated by the cloud layers each frame.
      fogBands: bandUniforms.fogBands,
      skyRadius: bandUniforms.skyRadius,
      cloudFogColor: bandUniforms.cloudFogColor,
      cloudFogEnabled: bandUniforms.cloudFogEnabled,
    },
    vertexShader: cloudVertexShader,
    fragmentShader: cloudFragmentShader,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  // The engine draws the sky box and then its cloud layers in fixed
  // index order, each blended over the last, BEFORE anything in the
  // scene (Sky::renderSkyBox). Distinct renderOrder per layer pins that
  // order — with a shared renderOrder, three.js's transparent depth sort
  // is degenerate for camera-centered meshes and the blend order can
  // flip with view angle (visible cloud "popping"). They must also sort
  // ahead of every default-order transparent effect: those write no
  // depth, so clouds drawn after them blend over bolts, particles and
  // explosion shapes, which then all but vanish against the sky.
  mesh.renderOrder = CLOUD_RENDER_ORDER + layerIndex;
  return {
    mesh,
    index: layerIndex,
    speed: config.speed,
    offset: new Vector2(0, 0),
  };
}

/**
 * The sky's cloud layers as domed meshes, matching the Tribes 2 cloud
 * rendering system: up to three layers from the sky's .dml (indices 7+),
 * each drawn as soon as its own texture loads, centered on the render
 * camera and scrolling with the wind. `currentFog` is the fog state
 * while fog is on — it drives the fog band overlay.
 */
export function startCloudLayers(
  engine: GameEngine,
  parent: Object3D,
  scene: SceneSky,
  currentFog: () => FogState | undefined,
  currentSky: () => SceneSky,
  currentTime: () => number,
): () => void {
  const materialList = scene.materialList || undefined;

  // From Tribes 2 sky.cc line 1170: mRadius = visibleDistance * 0.95
  const visibleDistance =
    scene.visibleDistance > 0 ? scene.visibleDistance : 500;
  const radius = visibleDistance * 0.95;

  const windDirection = new Vector2();

  // Fog band uniforms shared by all layers; the bands are overwritten
  // each frame below, so the initial values are placeholders.
  const bandUniforms: CloudBandUniforms = {
    fogBands: { value: new Vector4(0, 60, 0, 0) },
    skyRadius: { value: 300 },
    cloudFogColor: { value: new Vector3(0.5, 0.5, 0.5) },
    cloudFogEnabled: { value: false },
  };

  // Clouds render in gamma space (NoColorSpace textures), so blend with
  // the mission's raw sRGB fog color like the engine does.
  const { r: fogR, g: fogG, b: fogB } = scene.fogColor;
  bandUniforms.cloudFogColor.value.set(fogR, fogG, fogB);

  // Follows the camera; added once the .dml lists any cloud layers.
  const group = new Group();
  const layers: CloudLayer[] = [];
  let cloudCount = 0;
  let active = true;

  if (materialList) {
    void loadSharedDetailMapList(materialList).then(
      (detailMapList) => {
        if (!active) return;
        const configs = cloudLayerConfigs(detailMapList, scene);
        if (configs.length === 0) return;
        cloudCount = configs.length;
        parent.add(group);
        configs.forEach((config, layerIndex) => {
          const url = textureToUrl(config.texture);
          void engine
            .whenHost()
            .then(({ renderer }) =>
              loadTextures([url], renderer, setupCloudTexture),
            )
            .then(
              ([texture]) => {
                if (!active) return;
                const layer = createCloudLayer(
                  texture,
                  config,
                  radius,
                  layerIndex,
                  bandUniforms,
                );
                group.add(layer.mesh);
                layers.push(layer);
                engine.invalidate();
              },
              (error: unknown) => {
                if (!active) return;
                log.warn("cloud texture %s failed: %o", url, error);
              },
            );
        });
      },
      // No list, no clouds (the failure is logged where it's loaded).
      () => {},
    );
  }

  return combineCleanups(
    () => {
      active = false;
      parent.remove(group);
      for (const { mesh } of layers) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      layers.length = 0;
    },
    reaction(settingsStore, selectDebugMode, (debugMode) => {
      for (const { mesh } of layers)
        mesh.material.uniforms.debugMode.value = debugMode ? 1 : 0;
    }),
    engine.scheduler.add(FramePriority.PostCamera, ({ camera, delta }) => {
      // Make clouds follow camera position (they should appear infinitely
      // far away). From Tribes 2 sky.cc line 633-634:
      // glTranslatef(camPos.x, camPos.y, camPos.z) — clouds are translated
      // to camera position in all 3 dimensions.
      group.position.copy(camera.position);
      const sky = currentSky();
      const currentDistance =
        sky.visibleDistance > 0 ? sky.visibleDistance : 500;
      group.scale.setScalar(currentDistance / visibleDistance);
      group.visible = sky.weather?.cloudsOn !== false;
      cloudWindDirection(sky, windDirection);
      const storm = sky.weather?.cloudStorm;
      const time = storm ? currentTime() : 0;
      const { x: windX, y: windY } =
        sky.weather?.renderWind ?? sky.windVelocity;
      const windAxis = Math.max(Math.abs(windX), Math.abs(windY));
      for (const { mesh, index, speed } of layers) {
        const frame =
          storm && skyCloudStormFrame(storm, index, cloudCount, time);
        mesh.visible = frame ? frame.visible : true;
        mesh.material.uniforms.stormActive.value = !!frame;
        if (storm && frame?.visible) {
          // The storm center is in world axes, independently of UV scrolling.
          // Retail starts on the opposite Y side when Y is the dominant axis.
          const sign =
            (speed < 0 ? -1 : 1) *
            (storm.state === 1 ? 1 : -1) *
            (Math.abs(windX) < Math.abs(windY) ? -1 : 1);
          const distance = frame.center * sign;
          mesh.material.uniforms.stormCenter.value.set(
            windAxis && speed ? (windX * distance) / windAxis : distance,
            windAxis && speed ? (-windY * distance) / windAxis : 0,
          );
          mesh.material.uniforms.stormFade.value = frame.fade;
        }
      }
      const fogState = currentFog();
      bandUniforms.cloudFogEnabled.value = !!fogState;
      if (fogState) {
        const bands = computeSkyFogBands(
          fogState.visibleDistance,
          fogState.fogVolumes,
          camera.position.y,
        );
        bandUniforms.fogBands.value.set(
          bands.h0,
          bands.h1,
          bands.alpha0,
          bands.alpha1,
        );
        bandUniforms.skyRadius.value = bands.radius;
      }

      // Animate UV offset for cloud scrolling
      if (!settingsStore.getState().animationEnabled) return;
      // From Tribes 2: mOffset = (currentTime - mLastTime) / 32.0 (time in
      // ms). delta is in seconds, so: delta * 1000 / 32 = delta * 31.25
      const mOffset = (worldDeltaSec(delta) * 1000) / 32;
      for (const { mesh, speed, offset } of layers) {
        offset.x += windDirection.x * speed * mOffset;
        offset.y += windDirection.y * speed * mOffset;

        // Wrap to [0,1] range
        offset.x -= Math.floor(offset.x);
        offset.y -= Math.floor(offset.y);

        mesh.material.uniforms.uvOffset.value.copy(offset);
      }
    }),
  );
}
