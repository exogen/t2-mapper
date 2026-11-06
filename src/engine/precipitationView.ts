import {
  Audio,
  Box3,
  BufferGeometry,
  DynamicDrawUsage,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearMipmapNearestFilter,
  Matrix4,
  Mesh,
  NoColorSpace,
  Points,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  Texture,
  Vector3,
  Vector4,
} from "three";
import { audioToUrl, loadDetailMapList, textureToUrl } from "../loaders";
import { loadTexture } from "../textureUtils";
import { threeToTorque, torqueVecToThree } from "../scene/coordinates";
import { engineStore, worldDeltaSec } from "../state/engineStore";
import { gameEntityStore, selectSkyData } from "../state/gameEntityStore";
import { settingsStore } from "../state/settingsStore";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import type { PrecipitationEntity } from "../state/gameEntityTypes";
import { waterSurfaceForBounds } from "../collision/waterLevel";
import { getShapeBounds } from "../stream/shapeBounds";
import type { Vec3 } from "../scene/types";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { PrecipitationSimulation } from "../weather/precipitation";
import {
  roundZoneViewport,
  type DIFVisibilityRect,
} from "../dif/difVisibility";
import type { WeatherSound } from "../weather/types";
import { getAudioGraph } from "./audioGraph";
import {
  createPositionalAudio,
  getCachedAudioBuffer,
  getEffectiveSoundRate,
  getSoundGeneration,
  stopAndDetachSound,
  trackSound,
} from "./soundEffects";
import { FramePriority } from "./framePriority";
import type { EntityView } from "./entityViews";
import type { GameEngine } from "./gameEngine";
import { exteriorViewRect } from "./exteriorVisibility";

const CAPACITY = 2000;
const PRECIPITATION_RENDER_ORDER = 51;
const PLAYER_BOX_SIZE = { x: 1, y: 1, z: 2.3 };
const materialLists = new Map<string, Promise<string | undefined>>();

function firstMaterial(name: string): Promise<string | undefined> {
  let promise = materialLists.get(name);
  if (!promise) {
    promise = loadDetailMapList(name)
      .then((materials) => materials[0])
      .catch(() => undefined);
    materialLists.set(name, promise);
  }
  return promise;
}

function geometry(points: boolean): BufferGeometry {
  const result = new BufferGeometry();
  const vertices = points ? CAPACITY : CAPACITY * 4;
  result.setAttribute(
    "position",
    new Float32BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(
      DynamicDrawUsage,
    ),
  );
  result.setAttribute(
    "weatherColor",
    new Float32BufferAttribute(new Float32Array(vertices * 4), 4).setUsage(
      DynamicDrawUsage,
    ),
  );
  result.setAttribute(
    "weatherSize",
    new Float32BufferAttribute(new Float32Array(vertices), 1).setUsage(
      DynamicDrawUsage,
    ),
  );
  if (!points) {
    result.setAttribute(
      "uv",
      new Float32BufferAttribute(new Float32Array(vertices * 2), 2).setUsage(
        DynamicDrawUsage,
      ),
    );
    const indices = new Uint16Array(CAPACITY * 6);
    for (let i = 0; i < CAPACITY; i++) {
      const p = i * 4;
      indices.set([p, p + 1, p + 2, p, p + 2, p + 3], i * 6);
    }
    // setIndex chooses Uint16 without the WebGL reserved restart index.
    result.setIndex(Array.from(indices));
  }
  result.setDrawRange(0, 0);
  return result;
}

function material(points: boolean): ShaderMaterial {
  return new ShaderMaterial({
    defines: points ? { WEATHER_POINTS: 1 } : {},
    uniforms: {
      weatherTexture: { value: null },
      weatherClipRect: { value: new Vector4() },
    },
    vertexShader: `
      attribute vec4 weatherColor;
      attribute float weatherSize;
      varying vec4 vWeatherColor;
      #ifndef WEATHER_POINTS
        varying vec2 vWeatherUV;
      #endif
      void main() {
        vWeatherColor = weatherColor;
        #ifndef WEATHER_POINTS
          vWeatherUV = uv;
        #endif
        // Native precipitation vertices are world-space. The entity pose
        // pass may transform our named root, but it must not locate weather.
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        gl_PointSize = weatherSize;
      }
    `,
    fragmentShader: `
      uniform sampler2D weatherTexture;
      uniform vec4 weatherClipRect;
      varying vec4 vWeatherColor;
      #ifndef WEATHER_POINTS
        varying vec2 vWeatherUV;
      #endif
      void main() {
        if (gl_FragCoord.x < weatherClipRect.x || gl_FragCoord.y < weatherClipRect.y ||
            gl_FragCoord.x >= weatherClipRect.z || gl_FragCoord.y >= weatherClipRect.w) discard;
        vec4 color = vWeatherColor;
        #ifndef WEATHER_POINTS
          color *= texture2D(weatherTexture, vWeatherUV);
          if (color.a <= 0.1) discard;
        #endif
        gl_FragColor = color;
      }
    `,
    transparent: true,
    // Retail 00681a40/00682650 keep depth writes on in drop order.
    depthWrite: true,
    depthTest: true,
    fog: false,
    toneMapped: false,
    side: DoubleSide,
  });
}

/** Loop ownership follows the view; shared audio system handles pause/mute. */
function precipitationSound(
  profile: WeatherSound,
  parent: Group,
  engine: GameEngine,
): () => void {
  const { audioLoader, audioListener } = getAudioGraph();
  let disposed = false;
  const generation = getSoundGeneration();
  const sound = profile.is3D
    ? createPositionalAudio(audioListener, profile)
    : new Audio(audioListener);
  sound.setVolume(profile.volume);
  sound.setLoop(profile.isLooping);
  if (profile.is3D) parent.add(sound);
  let url: string;
  try {
    url = audioToUrl(profile.filename);
  } catch {
    return () => stopAndDetachSound(sound);
  }
  getCachedAudioBuffer(url, audioLoader, (buffer) => {
    if (disposed || generation !== getSoundGeneration()) return;
    sound.setBuffer(buffer);
    sound.setPlaybackRate(getEffectiveSoundRate());
    trackSound(sound);
    try {
      sound.play();
    } catch {
      /* Audio unlock may still be pending. */
    }
    engine.invalidate();
  });
  return () => {
    disposed = true;
    stopAndDetachSound(sound);
  };
}

/**
 * A camera-following precipitation field. Native rendering uses no fog and
 * a 4x4 atlas (FUN_00681a40/006834a0); snow billboards, rain aligns its long
 * edge to each drop's stored fall/wind vector, sand uses pixel-sized points.
 */
export function createPrecipitationView(
  initial: PrecipitationEntity,
  engine: GameEngine,
): EntityView {
  let entity = initial;
  const root = new Group();
  root.name = entity.id;
  // No positioned root: the .mis transform does not locate precipitation.
  const simulation = new PrecipitationSimulation();
  const quadGeometry = geometry(false),
    pointGeometry = geometry(true);
  const quadMaterial = material(false),
    pointMaterial = material(true);
  const mesh = new Mesh(quadGeometry, quadMaterial);
  const points = new Points(pointGeometry, pointMaterial);
  // 00681780 queues EndSort after ordinary translucent objects. Keep the
  // depth-writing precipitation pass after Lightning's order 50 as well.
  mesh.renderOrder = points.renderOrder = PRECIPITATION_RENDER_ORDER;
  mesh.frustumCulled = points.frustumCulled = false;
  mesh.visible = points.visible = false;
  root.add(mesh, points);
  let visibleExterior: DIFVisibilityRect = [-1, -1, 1, 1];
  const viewport = new Vector4();
  // Fragment clipping reproduces the native zone viewport without changing
  // the shared camera projection or the viewport used by other objects.
  mesh.onBeforeRender = points.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(viewport);
    const clip = roundZoneViewport(visibleExterior, viewport.z, viewport.w);
    for (const mat of [quadMaterial, pointMaterial])
      mat.uniforms.weatherClipRect.value.set(
        viewport.x + clip[0],
        viewport.y + clip[1],
        viewport.x + clip[2],
        viewport.y + clip[3],
      );
  };
  let disposed = false;
  let texture: Texture | undefined;
  let requestedMaterial = "";
  let textureToken = 0;
  let source: readonly unknown[] = [];
  let previousType: number | undefined;
  let stopSound: (() => void) | undefined;
  let soundKey = "";
  const cameraRight = new Vector3(),
    cameraUp = new Vector3();
  const vertex = new Vector3();
  const fallOffset = new Vector3();
  const cameraPosition = new Vector3();
  const controlBox = new Box3();
  const controlTransform = new Matrix4();
  const controlPosition = new Vector3();
  const controlRotation = new Quaternion();
  const controlScale = new Vector3();

  const requestTexture = (name: string) => {
    requestedMaterial = name;
    const token = ++textureToken;
    mesh.visible = false;
    texture?.dispose();
    texture = undefined;
    void firstMaterial(name).then((entry) => {
      if (!entry || disposed || token !== textureToken) return;
      let url: string;
      try {
        url = textureToUrl(entry);
      } catch {
        return;
      }
      const instance = new Texture();
      instance.flipY = false;
      instance.colorSpace = NoColorSpace;
      instance.wrapS = instance.wrapT = RepeatWrapping;
      instance.minFilter = LinearMipmapNearestFilter;
      texture = instance;
      const shared = loadTexture(url, (loaded) => {
        if (disposed || token !== textureToken) return;
        instance.source = loaded.source;
        instance.needsUpdate = true;
        quadMaterial.uniforms.weatherTexture.value = instance;
        engine.invalidate();
      });
      instance.source = shared.source;
    });
  };

  const stopFrame = engine.scheduler.add(
    FramePriority.PostCamera,
    ({ camera, delta, elapsed }) => {
      const config = entity.precipitation;
      const state = engineStore.getState();
      const recording = state.playback.recording;
      const runtime = state.runtime.runtime;
      const nextSource = [
        recording,
        recording?.streamingPlayback.worldGeneration,
        recording?.streamingPlayback.playbackRevision,
        state.playback.seekNonce,
        runtime,
      ];
      if (
        nextSource.some((value, i) => value !== source[i]) ||
        previousType !== config.type
      ) {
        simulation.reset();
        source = nextSource;
        previousType = config.type;
        stopSound?.();
        stopSound = undefined;
        soundKey = "";
      }
      if (config.materialList !== requestedMaterial)
        requestTexture(config.materialList);
      const audio = settingsStore.getState().audioEnabled;
      const seeking = state.playback.status === "seeking";
      const nextSoundKey =
        audio && config.sound && !seeking ? JSON.stringify(config.sound) : "";
      if (soundKey !== nextSoundKey) {
        stopSound?.();
        stopSound =
          audio && config.sound && !seeking
            ? precipitationSound(config.sound, root, engine)
            : undefined;
        soundKey = nextSoundKey;
      }
      if (seeking || commandCircuitStore.getState().active) {
        mesh.visible = points.visible = false;
        return;
      }
      camera.updateWorldMatrix(true, false);
      camera.getWorldPosition(cameraPosition);
      const exterior = exteriorViewRect(camera);
      if (!exterior) {
        mesh.visible = points.visible = false;
        return;
      }
      visibleExterior = exterior;
      const position = threeToTorque(cameraPosition);
      const now = recording
        ? streamClock.worldTime
        : runtime
          ? (Date.now() - runtime.state.startTime) / 1000
          : elapsed;
      const dt = worldDeltaSec(delta);
      const scale = delta > 0 ? dt / delta : 0;
      const sky = selectSkyData(gameEntityStore.getState());
      let wind: [number, number, number] | undefined;
      if (sky?.windEffectPrecipitation) {
        const vector = sky.weather?.renderWind ?? sky.windVelocity;
        // Sky::onAdd (005aab40) normalizes a Point2F: authored wind Z
        // never reduces the horizontal precipitation slant.
        const length = Math.hypot(vector.x, vector.y);
        if (length) wind = [vector.x / length, vector.y / length, 0];
      }
      const playback = streamPlaybackStore.getState();
      const snapshot = engine.streamSnapshot.current;
      // Native 00682910 casts the connection's control object to Player.
      // App orbit/follow/free-fly modes are observer cameras, so a followed
      // player's velocity must not bias their precipitation field.
      const controlledId =
        playback.cameraMode === "original"
          ? snapshot?.camera?.controlEntityId
          : undefined;
      const controlled = controlledId
        ? snapshot?.entities.find((candidate) => candidate.id === controlledId)
        : undefined;
      const playerVelocity =
        controlled?.type === "Player" ? controlled.velocity : undefined;
      // 00682910 uses ShapeBase's liquid coverage (005ea600), before the
      // Player cast. Player's object box comes from the armor datablock;
      // other ShapeBases use their DTS bounds.
      let liquidHeight: number | undefined;
      if (controlled?.position) {
        controlBox.min.set(0, 0, 0);
        controlBox.max.set(0, 0, 0);
        if (controlled.type === "Player") {
          const id = controlled.dataBlockId;
          const data =
            id == null
              ? undefined
              : recording?.streamingPlayback.getDataBlockData(id);
          const { x, y, z } =
            (data?.boxSize as Vec3 | undefined) ?? PLAYER_BOX_SIZE;
          controlBox.min.set(-y / 2, 0, -x / 2);
          controlBox.max.set(y / 2, z, x / 2);
        } else {
          const bounds = getShapeBounds(
            controlled.shapeHint ?? controlled.dataBlock,
          );
          if (bounds) {
            torqueVecToThree(bounds.min, controlBox.min);
            torqueVecToThree(bounds.max, controlBox.max);
          }
        }
        if (controlled.rotation) controlRotation.fromArray(controlled.rotation);
        else controlRotation.identity();
        if (controlled.scale) controlScale.fromArray(controlled.scale);
        else controlScale.set(1, 1, 1);
        controlTransform.compose(
          torqueVecToThree(controlled.position, controlPosition),
          controlRotation,
          controlScale,
        );
        liquidHeight = waterSurfaceForBounds(
          controlBox.applyMatrix4(controlTransform),
        );
      }
      simulation.update(config, now, scale, {
        camera: position,
        wind,
        playerVelocity,
        liquidHeight,
      });
      const pointMode = config.type === 2;
      const target = pointMode ? pointGeometry : quadGeometry;
      const positions = target.getAttribute(
        "position",
      ) as Float32BufferAttribute;
      const colors = target.getAttribute(
        "weatherColor",
      ) as Float32BufferAttribute;
      const sizes = target.getAttribute(
        "weatherSize",
      ) as Float32BufferAttribute;
      const uv = target.getAttribute("uv") as
        Float32BufferAttribute | undefined;
      cameraRight
        .setFromMatrixColumn(camera.matrixWorld, 0)
        .multiplyScalar(config.sizeX);
      cameraUp
        .setFromMatrixColumn(camera.matrixWorld, 1)
        .multiplyScalar(config.sizeY);
      let written = 0;
      for (let i = 0; i < simulation.drawCount; i++) {
        const p = simulation.drops[i];
        if (!p.active) continue;
        const color = config.colors[p.colorIndex] ??
          config.colors[0] ?? [1, 1, 1, 1];
        const x = p.position[1],
          y = p.position[2],
          z = p.position[0];
        if (pointMode) {
          // 006818c0/00682650 leave the scene modelview intact: native
          // sand points are world-space, unlike the camera-centered rain.
          positions.setXYZ(written, x, y, z);
          colors.setXYZW(written, color[0], color[1], color[2], p.alpha);
          sizes.setX(written, p.size);
        } else {
          fallOffset
            .set(p.offset[1], p.offset[2], p.offset[0])
            .multiplyScalar(config.sizeY * 2);
          const u = (p.textureIndex % 4) * 0.25;
          const v = Math.floor(p.textureIndex / 4) * 0.25;
          for (let corner = 0; corner < 4; corner++) {
            vertex
              .set(x, y, z)
              .addScaledVector(cameraRight, corner < 2 ? 1 : -1)
              .sub(cameraUp);
            if (corner === 0 || corner === 3) {
              if (config.type === 1) vertex.addScaledVector(cameraUp, 2);
              else vertex.add(fallOffset);
            }
            const index = written * 4 + corner;
            positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
            colors.setXYZW(index, color[0], color[1], color[2], p.alpha);
            uv!.setXY(
              index,
              u + (corner > 1 ? 0.25 : 0),
              v + (corner === 1 || corner === 2 ? 0.25 : 0),
            );
          }
        }
        written++;
      }
      positions.needsUpdate = colors.needsUpdate = sizes.needsUpdate = true;
      if (uv) uv.needsUpdate = true;
      target.setDrawRange(0, pointMode ? written : written * 6);
      points.visible = pointMode && config.enabled;
      mesh.visible = !pointMode && config.enabled && !!texture?.image;
      if (dt > 0 && config.enabled) engine.invalidate();
    },
  );
  engine.invalidate();
  return {
    root,
    update(next) {
      if (next.renderType !== "Precipitation") return false;
      entity = next;
      engine.invalidate();
      return true;
    },
    dispose() {
      disposed = true;
      textureToken++;
      stopFrame();
      stopSound?.();
      texture?.dispose();
      quadGeometry.dispose();
      pointGeometry.dispose();
      quadMaterial.dispose();
      pointMaterial.dispose();
    },
  };
}
