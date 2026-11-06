import {
  AdditiveBlending,
  Audio,
  Box3,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
  Uint16BufferAttribute,
  Vector3,
  type BufferAttribute,
  type Texture,
} from "three";
import type { LightningEntity } from "../state/gameEntityTypes";
import { engineStore, worldDeltaSec } from "../state/engineStore";
import {
  gameEntityStore,
  isStreamingSource,
  selectSkyData,
} from "../state/gameEntityStore";
import { streamClock } from "../state/streamPlaybackStore";
import { settingsStore } from "../state/settingsStore";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { castWorldRay } from "../collision/worldCollision";
import { castWaterRay } from "../collision/waterLevel";
import { terrainHeightAt } from "../collision/terrainCollision";
import { getShapeBounds, getShapeCenter } from "../stream/shapeBounds";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import { getClassTypeMask, TYPE_MASKS } from "../torqueScript/classHierarchy";
import { resolveDatablock } from "../torqueScript/datablocks";
import type { TorqueObject } from "../torqueScript/types";
import { timelineRandom } from "../stream/timelineRandom";
import {
  getParticleTexture,
  particleTexturesReady,
} from "../particles/particleRenderer";
import { threeToTorque } from "../scene/coordinates";
import type {
  LightningConfig,
  LightningStrike,
  WeatherPoint,
  WeatherSound,
} from "../weather/types";
import {
  ExploreLightningScheduler,
  LIGHTNING_STRIKE_LIFETIME,
  LightningStrikeSimulation,
  lightningThunderDelay,
  type LightningLine,
} from "../weather/lightning";
import { audioToUrl } from "../loaders";
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
import type { FrameContext } from "./frameScheduler";
import type { GameEngine } from "./gameEngine";

interface Storm {
  entity: LightningEntity;
  scheduler: ExploreLightningScheduler;
  lastRequest: number;
}

interface Strike {
  event: LightningStrike;
  end: WeatherPoint;
  simulation: LightningStrikeSimulation | null;
  mesh: Mesh<BufferGeometry, ShaderMaterial> | null;
  texture: Texture;
  lastAge: number;
  thunderAt: number;
  thunderPlayed: boolean;
}

const WHITE = [1, 1, 1];
const DAMAGEABLE_MASK =
  TYPE_MASKS.PlayerObjectType |
  TYPE_MASKS.VehicleObjectType |
  TYPE_MASKS.StationObjectType |
  TYPE_MASKS.GeneratorObjectType |
  TYPE_MASKS.SensorObjectType |
  TYPE_MASKS.DamagableItemObjectType |
  TYPE_MASKS.TurretObjectType;

/** Retail 0x628590 queries a square storm-height column, chooses its highest
 * exposed damageable object, then performs one chance draw. Explore runs
 * only the visual selection; damage remains owned by gameplay scripts. */
export function exploreLightningTarget(
  config: LightningConfig,
  start: [number, number],
  random: () => number,
  engine: GameEngine,
): Pick<LightningStrike, "targetId" | "targetPosition"> {
  const state = gameEntityStore.getState();
  const runtime = engineStore.getState().runtime.runtime;
  if (!runtime) return {};
  const x = config.position[0] + (start[0] - 0.5) * config.scale[0];
  const y = config.position[1] + (start[1] - 0.5) * config.scale[1];
  const top = config.position[2] + config.scale[2] * 0.5;
  const bottom = config.position[2] - config.scale[2] * 0.5;
  const query = new Box3(
    new Vector3(y - config.strikeRadius, bottom, x - config.strikeRadius),
    new Vector3(y + config.strikeRadius, top, x + config.strikeRadius),
  );
  let highest:
    | {
        id: string;
        position: WeatherPoint;
        object?: TorqueObject;
        className: string;
      }
    | undefined;
  for (const entity of state.missionEntities.values()) {
    if (entity.hidden || entity.debugHidden || !("shapeName" in entity))
      continue;
    const object = entity.runtimeObject as TorqueObject | undefined;
    const datablock = resolveDatablock(
      object?.datablock ?? entity.dataBlock,
      runtime,
    );
    const mask =
      getClassTypeMask(entity.className) | Number(datablock?.dynamictype || 0);
    if (!(mask & DAMAGEABLE_MASK)) continue;
    const bounds = getShapeBounds(entity.shapeName);
    const view = engine.entities.get(entity.id);
    if (!bounds || !view) continue;
    view.root.updateWorldMatrix(true, false);
    const box = new Box3(
      new Vector3(bounds.min[1], bounds.min[2], bounds.min[0]),
      new Vector3(bounds.max[1], bounds.max[2], bounds.max[0]),
    ).applyMatrix4(view.root.matrixWorld);
    if (!query.intersectsBox(box)) continue;
    const center = new Vector3(
      (bounds.min[1] + bounds.max[1]) * 0.5,
      (bounds.min[2] + bounds.max[2]) * 0.5,
      (bounds.min[0] + bounds.max[0]) * 0.5,
    ).applyMatrix4(view.root.matrixWorld);
    const position = threeToTorque(center);
    if (highest && highest.position[2] >= position[2]) continue;
    if (
      renderShapeRaycast.lightningTargetExposed(
        [position[0], position[1], top],
        [position[0], position[1], bottom],
        entity.id,
      )
    )
      highest = {
        id: entity.id,
        position,
        object,
        className: entity.className,
      };
  }
  if (!highest || random() > config.chanceToHitTarget) return {};
  // The server skips players without a controlling connection (warmup).
  if (highest.className === "Player" && !highest.object?.client) return {};
  return { targetId: highest.id, targetPosition: highest.position };
}

/** Native client endpoint resolution, 0x627f00: target centre or a vertical
 * ray through the storm (static collision mask 0x11d, including water). */
export function lightningImpact(
  event: LightningStrike,
  engine: GameEngine,
): WeatherPoint {
  if (event.targetPosition) return [...event.targetPosition];
  if (event.targetTransform) {
    const { shapeName, ...transform } = event.targetTransform;
    return getShapeCenter(shapeName, transform) ?? [...transform.position];
  }
  if (event.targetId) {
    const targetView = engine.entities.get(event.targetId);
    const state = gameEntityStore.getState();
    const entities = isStreamingSource(state.dataSource)
      ? state.streamEntities
      : state.missionEntities;
    const entity = entities.get(event.targetId);
    const bounds =
      entity && "shapeName" in entity
        ? getShapeBounds(entity.shapeName)
        : undefined;
    if (targetView && bounds) {
      targetView.root.updateWorldMatrix(true, false);
      const center = new Vector3(
        (bounds.min[1] + bounds.max[1]) * 0.5,
        (bounds.min[2] + bounds.max[2]) * 0.5,
        (bounds.min[0] + bounds.max[0]) * 0.5,
      ).applyMatrix4(targetView.root.matrixWorld);
      return threeToTorque(center);
    }
  }
  const { position, scale } = event.config;
  const x = position[0] + (event.start[0] - 0.5) * scale[0];
  const y = position[1] + (event.start[1] - 0.5) * scale[1];
  const start: WeatherPoint = [x, y, position[2] + scale[2] * 0.5];
  const end: WeatherPoint = [x, y, position[2] - scale[2] * 0.5];
  const world = castWorldRay(start, end, { includeStatics: true });
  const water = castWaterRay(start, end);
  if (water && (!world || water.t < world.t)) return water.point;
  if (world) return world.point;
  return [x, y, terrainHeightAt(x, y) ?? 0];
}

/** 0x629bc0: camera-facing triangle strips with alternating U. Positions are
 * Torque world coordinates; only the final GPU write swizzles to Three. */
export function writeWeatherLightningGeometry(
  geometry: BufferGeometry,
  lines: readonly LightningLine[],
  camera: WeatherPoint,
): void {
  const vertices = lines.reduce((sum, line) => sum + line.points.length * 2, 0);
  const indices = lines.reduce(
    (sum, line) => sum + Math.max(0, line.points.length - 1) * 6,
    0,
  );
  const position = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const color = new Float32Array(vertices * 4);
  const index = new Uint16Array(indices);
  // A bolt starts as three delayed ribbons, so its buffer layout grows as
  // they start. Release old GPU buffers before replacing any attributes.
  const oldPosition = geometry.getAttribute("position");
  if (oldPosition && oldPosition.array.length !== position.length)
    geometry.dispose();
  let vertex = 0,
    at = 0;
  for (const line of lines) {
    const base = vertex;
    for (let i = 0; i < line.points.length; i++) {
      const current = new Vector3(...line.points[i]);
      const segment =
        i === line.points.length - 1
          ? current.clone().sub(new Vector3(...line.points[i - 1]))
          : new Vector3(...line.points[i + 1]).sub(current);
      segment.normalize();
      const side = current
        .clone()
        .sub(new Vector3(...camera))
        .cross(segment)
        .normalize()
        .multiplyScalar(line.width * 0.5);
      const minus = current.clone().sub(side),
        plus = current.clone().add(side);
      position.set(
        [minus.y, minus.z, minus.x, plus.y, plus.z, plus.x],
        vertex * 3,
      );
      uv.set([line.u[i], 1, line.u[i], 0], vertex * 2);
      color.set([...line.color, ...line.color], vertex * 4);
      if (i < line.points.length - 1) {
        const v = base + i * 2;
        index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], at);
        at += 6;
      }
      vertex += 2;
    }
  }
  const write = (name: string, values: Float32Array, size: number) => {
    const old = geometry.getAttribute(name) as BufferAttribute | undefined;
    if (old && old.array.length === values.length) {
      (old.array as Float32Array).set(values);
      old.needsUpdate = true;
    } else
      geometry.setAttribute(
        name,
        new Float32BufferAttribute(values, size).setUsage(DynamicDrawUsage),
      );
  };
  write("position", position, 3);
  write("uv", uv, 2);
  write("boltColor", color, 4);
  const oldIndex = geometry.getIndex();
  if (oldIndex && oldIndex.array.length === index.length) {
    (oldIndex.array as Uint16Array).set(index);
    oldIndex.needsUpdate = true;
  } else
    geometry.setIndex(
      new Uint16BufferAttribute(index, 1).setUsage(DynamicDrawUsage),
    );
  geometry.setDrawRange(0, indices);
}

function material(config: LightningConfig, texture: Texture): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: `attribute vec4 boltColor; varying vec2 vUV; varying vec4 vColor;
      void main() { vUV=uv; vColor=boltColor; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D boltTexture; uniform bool hasTexture;
      uniform bool useFog; uniform vec3 fogColor; uniform float fogCoordinate;
      varying vec2 vUV; varying vec4 vColor;
      void main() { vec4 c=vColor; if(hasTexture) c*=texture2D(boltTexture,vUV);
        if(useFog) c.rgb=mix(c.rgb,fogColor,clamp(fogCoordinate,0.0,1.0)); gl_FragColor=c; }`,
    uniforms: {
      boltTexture: { value: texture },
      hasTexture: { value: particleTexturesReady.has(texture) },
      useFog: { value: config.useFog },
      fogColor: { value: WHITE },
      // Retail 0x627900 selects explicit fixed-function fog coordinates but
      // 0x629bc0 emits none. Its initial current fog coordinate is zero. Do
      // not replace this with Three's distance fog, which obscures bolts.
      fogCoordinate: { value: 0 },
    },
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
    toneMapped: false,
  });
}

function weatherScope(): readonly unknown[] {
  const state = engineStore.getState(),
    world = gameEntityStore.getState();
  const source = state.playback.recording?.streamingPlayback;
  return [
    state.runtime.runtime,
    state.playback.recording,
    source?.worldGeneration,
    source?.playbackRevision,
    source?.lightningHistory?.generation,
    state.playback.seekNonce,
    world.dataSource,
    world.missionName,
  ];
}

function sameScope(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** World-owned strike visuals and clocked thunder, shared by both sources. */
export class LightningEffects {
  readonly group = new Group();
  private readonly engine: GameEngine;
  private readonly storms = new Map<string, Storm>();
  private readonly strikes = new Map<string, Strike>();
  private readonly seen = new Set<number>();
  private readonly sounds = new Set<Audio<GainNode | PannerNode>>();
  private scope: readonly unknown[] = [];
  private exploreTime = 0;
  private nextId = 0;
  private lastTime = NaN;
  private soundEpoch = 0;
  private readonly cameraPosition = new Vector3();

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  install(): () => void {
    return this.engine.withHost(({ scene }) => {
      scene.add(this.group);
      const stop = this.engine.scheduler.add(
        FramePriority.PostCamera,
        (frame) => this.update(frame),
      );
      const stopSettings = settingsStore.subscribe((state) => {
        if (!state.audioEnabled) this.stopSounds();
      });
      return () => {
        stop();
        stopSettings();
        this.clear();
        this.group.removeFromParent();
      };
    });
  }

  add(entity: LightningEntity): {
    update(entity: LightningEntity): void;
    dispose(): void;
  } {
    const storm: Storm = {
      entity,
      scheduler: new ExploreLightningScheduler(),
      lastRequest: -1,
    };
    this.storms.set(entity.id, storm);
    if (entity.lightning.strikeTextures[0])
      getParticleTexture(entity.lightning.strikeTextures[0]);
    this.engine.invalidate();
    return {
      update: (next) => {
        storm.entity = next;
        this.engine.invalidate();
      },
      dispose: () => {
        if (this.storms.get(entity.id) === storm) this.storms.delete(entity.id);
        for (const [key, strike] of this.strikes)
          if (strike.event.stormId === entity.id) this.remove(key, strike);
        if (!this.storms.size) {
          this.stopSounds();
          this.scope = [];
          this.seen.clear();
        }
        this.engine.invalidate();
      },
    };
  }

  private remove(key: string, strike: Strike): void {
    strike.mesh?.geometry.dispose();
    strike.mesh?.material.dispose();
    strike.mesh?.removeFromParent();
    this.strikes.delete(key);
  }

  private stopSounds(): void {
    this.soundEpoch++;
    for (const sound of this.sounds) stopAndDetachSound(sound);
    this.sounds.clear();
  }

  private clear(): void {
    for (const [key, strike] of this.strikes) this.remove(key, strike);
    this.seen.clear();
    this.stopSounds();
    this.lastTime = NaN;
    for (const storm of this.storms.values()) {
      storm.scheduler = new ExploreLightningScheduler();
      storm.lastRequest = -1;
    }
    this.scope = [];
  }

  private play(profile: WeatherSound | undefined, at?: WeatherPoint): void {
    if (!profile || !settingsStore.getState().audioEnabled) return;
    const playback = engineStore.getState().playback;
    if (playback.recording && !(worldDeltaSec(1) > 0)) return;
    const { audioLoader, audioListener } = getAudioGraph();
    if (audioListener.context.state !== "running") return;
    const position = at ? new Vector3(at[1], at[2], at[0]) : undefined;
    if (
      position &&
      profile.is3D &&
      position.distanceTo(audioListener.getWorldPosition(new Vector3())) >
        profile.maxDist
    )
      return;
    let url: string;
    try {
      url = audioToUrl(profile.filename);
    } catch {
      return;
    }
    const epoch = this.soundEpoch;
    const generation = getSoundGeneration();
    const scope = weatherScope();
    getCachedAudioBuffer(url, audioLoader, (buffer) => {
      if (
        epoch !== this.soundEpoch ||
        generation !== getSoundGeneration() ||
        !sameScope(scope, weatherScope()) ||
        !settingsStore.getState().audioEnabled ||
        audioListener.context.state !== "running"
      )
        return;
      if (engineStore.getState().playback.recording && !(worldDeltaSec(1) > 0))
        return;
      const sound =
        position && profile.is3D
          ? createPositionalAudio(audioListener, profile)
          : new Audio(audioListener);
      sound.setBuffer(buffer);
      sound.setVolume(profile.volume);
      sound.setLoop(profile.isLooping);
      sound.setPlaybackRate(getEffectiveSoundRate());
      if (position) sound.position.copy(position);
      this.group.add(sound);
      this.sounds.add(sound);
      trackSound(sound);
      const ended = sound.onEnded.bind(sound);
      sound.onEnded = () => {
        ended();
        this.sounds.delete(sound);
        stopAndDetachSound(sound);
      };
      try {
        sound.play();
      } catch {
        this.sounds.delete(sound);
        stopAndDetachSound(sound);
      }
    });
  }

  private addStrike(
    key: string,
    event: LightningStrike,
    now: number,
    camera: WeatherPoint,
    freshAudio: boolean,
  ): void {
    const age = Math.max(0, now - event.time);
    const end = lightningImpact(event, this.engine);
    const hasThunder = event.config.thunderSounds.length > 0;
    const delay = hasThunder ? lightningThunderDelay(camera, end) : 0;
    const thunderAt = event.time + delay;
    const simulation =
      age <= LIGHTNING_STRIKE_LIFETIME
        ? new LightningStrikeSimulation(
            event.config,
            end,
            timelineRandom(event.id, event.time, ...end),
          )
        : null;
    let mesh: Strike["mesh"] = null;
    const texture = getParticleTexture(event.config.strikeTextures[0] ?? "");
    if (simulation) {
      simulation.advanceTo(age, event.config);
      mesh = new Mesh(new BufferGeometry(), material(event.config, texture));
      mesh.frustumCulled = false;
      mesh.renderOrder = 50;
      this.group.add(mesh);
    }
    const strike: Strike = {
      event,
      end,
      simulation,
      mesh,
      texture,
      lastAge: age,
      thunderAt,
      thunderPlayed: !hasThunder || (!freshAudio && thunderAt <= now),
    };
    this.strikes.set(key, strike);
    if (freshAudio) this.play(event.config.strikeSound, end);
    if (freshAudio && hasThunder && delay === 0) {
      const random = timelineRandom(event.id, event.time, 330);
      this.play(
        event.config.thunderSounds[
          Math.floor(random() * event.config.thunderSounds.length)
        ],
      );
      strike.thunderPlayed = true;
    }
  }

  private update(frame: FrameContext): void {
    if (!this.storms.size && !this.strikes.size) {
      this.scope = [];
      return;
    }
    const state = engineStore.getState(),
      world = gameEntityStore.getState();
    const source = state.playback.recording?.streamingPlayback;
    const history = source?.lightningHistory;
    const nextScope = weatherScope();
    const changed = !sameScope(nextScope, this.scope);
    if (changed) {
      this.clear();
      this.scope = nextScope;
    }
    if (state.playback.status === "seeking") return;
    const delta = worldDeltaSec(frame.delta);
    this.exploreTime += source ? 0 : delta;
    const runtime = state.runtime.runtime;
    const now = source
      ? streamClock.worldTime
      : runtime
        ? (Date.now() - runtime.state.startTime) / 1000
        : this.exploreTime;
    const hidden =
      commandCircuitStore.getState().active ||
      frame.camera.type === "OrthographicCamera";
    this.group.visible = !hidden;
    // The command map's camera is kilometres above the world. Its weather
    // is hidden, while thunder keeps using the observer's physical camera.
    const viewCamera = hidden ? this.engine.cameras.perspective : frame.camera;
    viewCamera.updateWorldMatrix(true, false);
    const camera = threeToTorque(
      viewCamera.getWorldPosition(this.cameraPosition),
    );
    if (source) {
      const retained = new Set(history?.events.map((event) => event.id));
      for (const id of this.seen) if (!retained.has(id)) this.seen.delete(id);
      for (const event of history?.events ?? []) {
        if (
          event.time > now ||
          this.seen.has(event.id) ||
          !this.storms.has(event.stormId)
        )
          continue;
        this.seen.add(event.id);
        this.addStrike(
          `recorded:${event.id}`,
          event,
          now,
          camera,
          !changed &&
            delta > 0 &&
            Number.isFinite(this.lastTime) &&
            event.time >= this.lastTime - 0.001,
        );
      }
    } else if (!isStreamingSource(world.dataSource)) {
      for (const [id, storm] of this.storms) {
        const count = storm.scheduler.update(
          delta,
          storm.entity.lightning.strikesPerMinute,
        );
        for (let i = 0; i < count; i++) {
          const eventId = this.nextId++;
          const random = timelineRandom(
            eventId,
            now,
            ...storm.entity.lightning.position,
          );
          const start: [number, number] = [random(), random()];
          this.addStrike(
            `explore:${eventId}`,
            {
              id: eventId,
              time: now,
              stormId: id,
              start,
              config: storm.entity.lightning,
              ...exploreLightningTarget(
                storm.entity.lightning,
                start,
                random,
                this.engine,
              ),
            },
            now,
            camera,
            true,
          );
        }
        for (const request of storm.entity.lightningRequests ?? []) {
          if (request.sequence <= storm.lastRequest) continue;
          storm.lastRequest = request.sequence;
          const eventId = this.nextId++;
          const random = timelineRandom(
            eventId,
            request.time,
            ...storm.entity.lightning.position,
          );
          const start: [number, number] = [random(), random()];
          const target = exploreLightningTarget(
            storm.entity.lightning,
            start,
            random,
            this.engine,
          );
          this.addStrike(
            `explore:${eventId}`,
            {
              id: eventId,
              time: request.time,
              stormId: id,
              start,
              targetId: target.targetId,
              targetPosition: target.targetPosition,
              config: storm.entity.lightning,
            },
            now,
            camera,
            !changed && request.time >= (this.lastTime || 0),
          );
        }
      }
    }
    const sky = selectSkyData(world);
    for (const [key, strike] of this.strikes) {
      const age = now - strike.event.time;
      // Native 0x627900 reads current storm colours, fog and datablock;
      // width, nodes and endpoints remain captured at strike creation.
      const renderConfig =
        this.storms.get(strike.event.stormId)?.entity.lightning ??
        strike.event.config;
      if (strike.simulation && strike.mesh) {
        strike.simulation.update(Math.max(0, age - strike.lastAge));
        strike.lastAge = age;
        if (age > LIGHTNING_STRIKE_LIFETIME) {
          strike.mesh.geometry.dispose();
          strike.mesh.material.dispose();
          strike.mesh.removeFromParent();
          strike.mesh = null;
          strike.simulation = null;
        } else {
          writeWeatherLightningGeometry(
            strike.mesh.geometry,
            strike.simulation.lines(renderConfig, delta > 0 && !hidden),
            camera,
          );
          strike.texture = getParticleTexture(
            renderConfig.strikeTextures[0] ?? "",
          );
          strike.mesh.material.uniforms.boltTexture.value = strike.texture;
          strike.mesh.material.uniforms.hasTexture.value =
            particleTexturesReady.has(strike.texture);
          strike.mesh.material.uniforms.fogColor.value = sky
            ? [sky.fogColor.r, sky.fogColor.g, sky.fogColor.b]
            : WHITE;
          strike.mesh.material.uniforms.useFog.value =
            renderConfig.useFog && settingsStore.getState().fogEnabled;
        }
      }
      if (!strike.thunderPlayed && now >= strike.thunderAt && delta > 0) {
        const random = timelineRandom(strike.event.id, strike.event.time, 330);
        this.play(
          renderConfig.thunderSounds[
            Math.floor(random() * renderConfig.thunderSounds.length)
          ],
        );
        strike.thunderPlayed = true;
      }
      if (
        !strike.mesh &&
        (strike.thunderPlayed || !strike.event.config.thunderSounds.length)
      )
        this.remove(key, strike);
    }
    this.lastTime = now;
    if (delta > 0 && (this.strikes.size || (!source && this.storms.size)))
      this.engine.invalidate();
  }
}
