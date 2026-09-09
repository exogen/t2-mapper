import { Group, type Vector3 } from "three";
import type { DTSModel } from "../../dts/dtsModel";
import type { ExplosionEntity } from "../../state/gameEntityTypes";
import { streamClock } from "../../state/streamPlaybackStore";
import {
  explosionPlaySpeed,
  resolveExplosionTiming,
} from "../../stream/explosionLifetime";
import { getShapeSequenceDurationSec } from "../../stream/shapeSequences";
import { createEffectShape } from "../../effectShape";
import type { ProjectileView } from "./types";
function extractSizeKeyframes(expBlock: Record<string, unknown>): {
  times: number[];
  sizes: [number, number, number][];
} {
  const rawSizes = expBlock.sizes as
    Array<{ x: number; y: number; z: number }> | undefined;
  const rawTimes = expBlock.times as number[] | undefined;

  if (!Array.isArray(rawSizes) || rawSizes.length === 0) {
    return {
      times: [0, 1],
      sizes: [
        [1, 1, 1],
        [1, 1, 1],
      ],
    };
  }

  // sizes are packed as value*100 integers on the wire; divide by 100.
  const sizes: [number, number, number][] = rawSizes.map((s) => [
    s.x / 100,
    s.y / 100,
    s.z / 100,
  ]);
  // times are written via writeFloat(8) and are already [0,1] floats.
  const times = Array.isArray(rawTimes)
    ? rawTimes
    : sizes.map((_, i) => i / Math.max(sizes.length - 1, 1));

  return { times, sizes };
}

function interpolateSize(
  keyframes: { times: number[]; sizes: [number, number, number][] },
  t: number,
  target: Vector3,
): Vector3 {
  const { times, sizes } = keyframes;
  if (times.length === 0) return target.set(1, 1, 1);
  if (t <= times[0]) return target.fromArray(sizes[0]);
  if (t >= times[times.length - 1])
    return target.fromArray(sizes[sizes.length - 1]);

  for (let i = 0; i < times.length - 1; i++) {
    if (t >= times[i] && t <= times[i + 1]) {
      const frac = (t - times[i]) / (times[i + 1] - times[i]);
      return target.set(
        sizes[i][0] + (sizes[i + 1][0] - sizes[i][0]) * frac,
        sizes[i][1] + (sizes[i + 1][1] - sizes[i][1]) * frac,
        sizes[i][2] + (sizes[i + 1][2] - sizes[i][2]) * frac,
      );
    }
  }
  return target.fromArray(sizes[sizes.length - 1]);
}

export function createExplosionView(
  model: DTSModel,
  shapeName: string,
  expBlock: Record<string, unknown> | undefined,
  anisotropy: number,
): ProjectileView<ExplosionEntity> {
  const root = new Group(),
    group = new Group(),
    flip = new Group();
  root.add(group);
  group.add(flip);
  flip.rotation.y = Math.PI;
  const shape = createEffectShape(model, shapeName, {
    anisotropy,
    ignoreDetailSize: true,
    loop: false,
    transparent: true,
  });
  flip.add(shape.scene);
  const sizeKeyframes = expBlock ? extractSizeKeyframes(expBlock) : undefined;
  const defaultLifetime = resolveExplosionTiming(
    expBlock,
    getShapeSequenceDurationSec(shapeName, "ambient"),
  ).lifetimeMS;
  const playSpeed = explosionPlaySpeed(expBlock);
  let spawn = streamClock.time,
    angle = 0;
  return {
    root,
    reset(entity) {
      shape.reset();
      spawn = entity.spawnTime ?? streamClock.time;
      angle = Math.random() * Math.PI * 2;
      group.scale.set(1, 1, 1);
      group.quaternion.identity();
    },
    release() {},
    dispose: shape.dispose,
    update(entity, camera) {
      const elapsed = Math.max(0, streamClock.time - spawn);
      shape.setTime(elapsed * playSpeed);
      if (sizeKeyframes)
        interpolateSize(
          sizeKeyframes,
          Math.min(
            ((entity.startAgeMS ?? 0) + elapsed * 1000) /
              (entity.lifetimeMS ?? defaultLifetime),
            1,
          ),
          group.scale,
        );
      if (entity.faceViewer !== false) {
        group.lookAt(camera.position);
        group.rotateZ(angle);
      }
    },
  };
}
