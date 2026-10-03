import { DataTexture, type Texture } from "three";
import { texturePixels, type TexturePixels } from "../texturePixels";
import { timelineRandom } from "../stream/timelineRandom";
import type {
  DIFAnimatedLight,
  DIFInterior,
  DIFLightState,
  DIFSurface,
} from "./dif";
import type { DIFMaterial, DIFModel } from "./difLoader";

const LIGHT_UPDATE_MS = 66;
const AMBIENT = 1,
  LOOP = 2,
  FLICKER = 4,
  ALARM = 8;

interface LightSample {
  state: number;
  color: [number, number, number];
}

/** FUN_00525d90/00525fc0/005260c0: interpolate colors, select the current
 * state's intensity map. Flicker uses the app's repeatable cosmetic RNG;
 * the executable's process-wide random seed is not present in recordings. */
export function sampleDIFLight(
  light: DIFAnimatedLight,
  states: readonly DIFLightState[],
  timeMs: number,
  out: LightSample,
  seed = 0,
): void {
  const type = light.flags & 7;
  let time = Math.max(0, timeMs);
  if (!(light.flags & (AMBIENT | ALARM))) time = 0;
  if (type & FLICKER) {
    const period = states[light.stateIndex + 1]?.activeTime ?? 0;
    const step = period > 0 ? Math.floor(time / period) : 0;
    time =
      step > 0
        ? Math.floor(timelineRandom(seed, step)() * (light.duration + 1))
        : 0;
  } else if (type & LOOP) {
    time = light.duration > 0 ? time % light.duration : 0;
  } else {
    time = Math.min(time, light.duration);
  }
  let index = 0;
  while (
    index + 1 < light.stateCount &&
    states[light.stateIndex + index + 1].activeTime <= time
  )
    index++;
  out.state = index;
  const current = states[light.stateIndex + index];
  const next =
    states[
      light.stateIndex +
        (index + 1 < light.stateCount ? index + 1 : type & LOOP ? 0 : index)
    ];
  const end = index + 1 < light.stateCount ? next.activeTime : light.duration;
  const fraction =
    !(type & FLICKER) && end > current.activeTime
      ? Math.min(1, (time - current.activeTime) / (end - current.activeTime))
      : 0;
  for (let c = 0; c < 3; c++)
    out.color[c] = Math.round(
      current.color[c] + (next.color[c] - current.color[c]) * fraction,
    );
}

interface Slot {
  light: number;
  maps: number[];
}
interface LitSurface {
  surface: DIFSurface;
  slots: Slot[];
}
interface AtlasPlan {
  surfaces: LitSurface[];
  lights: number[];
}

const plans = new WeakMap<DIFInterior, Map<number, AtlasPlan>>();

/** Compile file-order state installations once per shared DIF, not per frame
 * or building. Exported assets can write the same slot many times: last wins. */
function lightingPlan(interior: DIFInterior): Map<number, AtlasPlan> {
  const cached = plans.get(interior);
  if (cached) return cached;
  const slots = new Map<number, Slot>();
  interior.animatedLights.forEach((light, lightIndex) => {
    for (let stateIndex = 0; stateIndex < light.stateCount; stateIndex++) {
      const state = interior.lightStates[light.stateIndex + stateIndex];
      for (
        let i = state.dataIndex;
        i < state.dataIndex + state.dataCount;
        i++
      ) {
        const data = interior.lightStateData[i];
        let slot = slots.get(data.lightStateIndex);
        if (!slot) {
          slot = {
            light: lightIndex,
            maps: Array(light.stateCount).fill(0xffffffff),
          };
          slots.set(data.lightStateIndex, slot);
        }
        slot.maps[stateIndex] = data.mapIndex;
      }
    }
  });
  const result = new Map<number, AtlasPlan>();
  interior.surfaces.forEach((surface, surfaceIndex) => {
    if (!surface.lightCount) return;
    for (const alarm of [false, true]) {
      if (alarm && !interior.hasAlarmState) continue;
      const index = (
        alarm ? interior.alarmLightMapIndices : interior.normalLightMapIndices
      )[surfaceIndex];
      if (index === 0xff) continue;
      const contributions: Slot[] = [];
      for (let i = 0; i < surface.lightCount; i++) {
        const slot = slots.get(surface.lightStateInfoStart + i);
        if (
          slot &&
          Boolean(interior.animatedLights[slot.light].flags & ALARM) === alarm
        )
          contributions.push(slot);
      }
      if (!contributions.length) continue;
      const key = index * 2 + Number(alarm);
      let plan = result.get(key);
      if (!plan) {
        plan = { surfaces: [], lights: [] };
        result.set(key, plan);
      }
      plan.surfaces.push({ surface, slots: contributions });
      for (const slot of contributions)
        if (!plan.lights.includes(slot.light)) plan.lights.push(slot.light);
    }
  });
  plans.set(interior, result);
  return result;
}

interface AnimatedAtlas {
  texture: DataTexture;
  data: Uint8Array;
  base: TexturePixels;
  plan: AtlasPlan;
  bucket: number;
  versions: number[];
}

/** Per-building materials and lazy animated atlases. Geometry, original
 * textures and compiled light plans remain shared. Call only before a visible
 * draw: at most one atlas upload per 66 ms, none while paused or offscreen. */
export class DIFLighting {
  readonly model: DIFModel;
  readonly materials: DIFMaterial[];
  private readonly plan: Map<number, AtlasPlan>;
  private readonly atlases = new Map<number, AnimatedAtlas>();
  private readonly lights: (LightSample & {
    bucket: number;
    version: number;
  })[];
  private readonly ownsMaterials: boolean;
  alarmState = false;

  constructor(model: DIFModel) {
    this.model = model;
    this.ownsMaterials =
      model.interior.hasAlarmState || model.interior.animatedLights.length > 0;
    this.materials = model.surfaceMeshes.map(({ material }) =>
      this.ownsMaterials ? material.clone() : material,
    );
    this.plan = lightingPlan(model.interior);
    this.lights = model.interior.animatedLights.map(() => ({
      state: -1,
      color: [0, 0, 0],
      bucket: -Infinity,
      version: 0,
    }));
  }

  setAlarmState(alarm: boolean): boolean {
    const next = alarm && this.model.interior.hasAlarmState;
    if (next === this.alarmState) return false;
    this.alarmState = next;
    for (const material of this.materials) {
      const index = next
        ? material.alarmLightMapIndex
        : material.normalLightMapIndex;
      this.assign(material, this.model.lightMaps[index] ?? null);
    }
    return true;
  }

  hasAnimatedLightMap(material: DIFMaterial, alarm: boolean): boolean {
    const enabled = alarm && this.model.interior.hasAlarmState;
    const index = enabled
      ? material.alarmLightMapIndex
      : material.normalLightMapIndex;
    return this.plan.has(index * 2 + Number(enabled));
  }

  private assign(material: DIFMaterial, texture: Texture | null): void {
    if (Boolean(material.lightMap) !== Boolean(texture))
      material.needsUpdate = true;
    material.lightMap = texture;
  }

  prepare(material: DIFMaterial, timeMs: number): void {
    const index = this.alarmState
      ? material.alarmLightMapIndex
      : material.normalLightMapIndex;
    const key = index * 2 + Number(this.alarmState);
    const plan = this.plan.get(key);
    if (!plan) return;
    let atlas = this.atlases.get(key);
    if (!atlas) {
      const source = this.model.lightMaps[index];
      const base = source && texturePixels(source);
      if (!base) return;
      const data = new Uint8Array(base.data);
      const texture = new DataTexture(data, base.width, base.height);
      texture.channel = source.channel;
      texture.flipY = source.flipY;
      texture.colorSpace = source.colorSpace;
      texture.minFilter = source.minFilter;
      texture.magFilter = source.magFilter;
      texture.name = `${source.name} animated`;
      texture.needsUpdate = true;
      atlas = {
        texture,
        data,
        base,
        plan,
        bucket: -Infinity,
        versions: plan.lights.map(() => -1),
      };
      this.atlases.set(key, atlas);
    }
    this.assign(material, atlas.texture);
    const bucket = Math.floor(Math.max(0, timeMs) / LIGHT_UPDATE_MS);
    if (bucket === atlas.bucket) return;
    atlas.bucket = bucket;
    let changed = false;
    for (let i = 0; i < plan.lights.length; i++) {
      const lightIndex = plan.lights[i];
      const sample = this.lights[lightIndex];
      if (sample.bucket !== bucket) {
        const { state } = sample;
        const [r, g, b] = sample.color;
        sampleDIFLight(
          this.model.interior.animatedLights[lightIndex],
          this.model.interior.lightStates,
          bucket * LIGHT_UPDATE_MS,
          sample,
          lightIndex,
        );
        sample.bucket = bucket;
        if (
          state !== sample.state ||
          r !== sample.color[0] ||
          g !== sample.color[1] ||
          b !== sample.color[2]
        )
          sample.version++;
      }
      if (atlas.versions[i] !== sample.version) changed = true;
      atlas.versions[i] = sample.version;
    }
    if (!changed) return;
    this.composite(atlas);
    atlas.texture.needsUpdate = true;
  }

  /** FUN_00524ec0/005263f0: restore the base patch, then saturating byte
   * additions in gamma space. Keep the CPU base immutable for object probes. */
  private composite(atlas: AnimatedAtlas): void {
    const { data } = atlas;
    const { width } = atlas.base;
    const buffer = this.model.interior.lightStateBuffer;
    for (const { surface, slots } of atlas.plan.surfaces) {
      const [x, y] = surface.mapOffset;
      const [w, h] = surface.mapSize;
      for (let row = 0; row < h; row++) {
        const start = ((y + row) * width + x) * 4;
        for (let p = start; p < start + w * 4; p++)
          data[p] = atlas.base.data[p];
      }
      for (const slot of slots) {
        const sample = this.lights[slot.light];
        const map = slot.maps[sample.state];
        if (map === 0xffffffff) continue;
        const [r, g, b] = sample.color;
        for (let row = 0; row < h; row++) {
          let p = ((y + row) * width + x) * 4;
          let m = map + row * w;
          for (let col = 0; col < w; col++, p += 4, m++) {
            const intensity = buffer[m];
            data[p] = Math.min(255, data[p] + ((r * intensity + 128) >> 8));
            data[p + 1] = Math.min(
              255,
              data[p + 1] + ((g * intensity + 128) >> 8),
            );
            data[p + 2] = Math.min(
              255,
              data[p + 2] + ((b * intensity + 128) >> 8),
            );
          }
        }
      }
    }
  }

  dispose(): void {
    if (this.ownsMaterials)
      for (const material of this.materials) material.dispose();
    for (const atlas of this.atlases.values()) atlas.texture.dispose();
    this.atlases.clear();
  }
}
