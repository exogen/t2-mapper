import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from "three";
import type { Mesh, Texture } from "three";
import type { SplashDataBlock } from "t2-demo-parser";
import { createEffectRingMaterial, effectMesh } from "./geometry";

const GRAVITY = 9.8;
const MAX_RING_POINTS = 256;
const MAX_ACTIVE_RINGS = 64;
const WHITE = { r: 1, g: 1, b: 1 };

type RingColors = NonNullable<SplashDataBlock["colors"]>;

export interface SplashRings {
  root: Mesh;
  update(ageSec: number, deadAtSec: number): void;
  dispose(): void;
}

function sampleColor(colors: RingColors, times: number[], progress: number) {
  let previous = colors[0] ?? WHITE;
  for (let i = 1; i < colors.length; i++) {
    const next = colors[i];
    const end = times[i] ?? 1;
    if (progress < end) {
      const start = times[i - 1] ?? 0;
      const t =
        end > start ? Math.max(0, (progress - start) / (end - start)) : 0;
      return {
        r: previous.r + (next.r - previous.r) * t,
        g: previous.g + (next.g - previous.g) * t,
        b: previous.b + (next.b - previous.b) * t,
      };
    }
    previous = next;
  }
  return previous;
}

/** Sample the ring from its birth time so a seek can render it immediately. */
function ringPosition(
  radialSpeed: number,
  verticalSpeed: number,
  age: number,
  deadAge: number,
  acceleration: number,
): [number, number] {
  const remaining = age - deadAge;
  if (remaining <= 0 || acceleration === 0) {
    return [radialSpeed * age, (verticalSpeed - GRAVITY * age * 0.5) * age];
  }
  let radius = radialSpeed * deadAge;
  let height = (verticalSpeed - GRAVITY * deadAge * 0.5) * deadAge;
  verticalSpeed -= GRAVITY * deadAge;
  // Once the splash stops ejecting rings, Splash::updateRing applies the
  // authored acceleration along the ring point's changing velocity.
  const steps = Math.min(64, Math.ceil(remaining * 120));
  const dt = remaining / steps;
  for (let i = 0; i < steps; i++) {
    const speed = Math.hypot(radialSpeed, verticalSpeed);
    const factor = speed === 0 ? 0 : acceleration / speed;
    const radialAcceleration = radialSpeed * factor;
    const verticalAcceleration = verticalSpeed * factor - GRAVITY;
    radius += (radialSpeed + radialAcceleration * dt * 0.5) * dt;
    height += (verticalSpeed + verticalAcceleration * dt * 0.5) * dt;
    radialSpeed += radialAcceleration * dt;
    verticalSpeed += verticalAcceleration * dt;
  }
  return [radius, height];
}

/** The retail splash connects adjacent ejected rings with textured strips. */
export function createSplashRings(
  data: SplashDataBlock,
  texture: Texture,
): SplashRings | null {
  const frequency = data.ejectionFreq ?? 5;
  const lifetime = data.ringLifetime ?? 1;
  const overlaps = frequency * lifetime;
  // Most disc and sniper splashes eject one point ring and use particles for
  // the visible effect. No strip can form without two living rings.
  if (!Number.isFinite(overlaps) || frequency <= 0 || overlaps <= 1)
    return null;

  const pointCount = Math.min(
    MAX_RING_POINTS,
    Math.max(3, Math.trunc(data.numSegments ?? 10) + 1),
  );
  const pointStride = pointCount + 1;
  const capacity = Math.min(MAX_ACTIVE_RINGS, Math.ceil(overlaps));
  const positions = new Float32Array(pointStride * capacity * 3);
  const colors = new Float32Array(pointStride * capacity * 4);
  const texCoords = new Float32Array(pointStride * capacity * 2);
  const indices = new Uint16Array(pointCount * (capacity - 1) * 6);
  const texWrap = data.texWrap ?? 1;
  const texFactor = data.texFactor ?? 3;
  const acceleration = data.acceleration ?? 0;
  const startRadius = data.startRadius ?? 0.5;
  const angle = ((data.ejectionAngle ?? 45) * Math.PI) / 180;
  const speed = data.velocity ?? 5;
  const radialSpeed = speed * Math.sin(angle);
  const verticalSpeed = speed * Math.cos(angle);
  const colorKeys = data.colors ?? [];
  const colorTimes = data.times ?? [0, 1, 1, 1];

  const cos = new Float32Array(pointStride);
  const sin = new Float32Array(pointStride);
  for (let point = 0; point < pointStride; point++) {
    const phi = ((point % pointCount) / pointCount) * 2 * Math.PI;
    cos[point] = Math.cos(phi);
    sin[point] = Math.sin(phi);
  }
  for (let ring = 0; ring < capacity; ring++) {
    for (let point = 0; point < pointStride; point++) {
      const vertex = ring * pointStride + point;
      texCoords[vertex * 2] = (point / pointCount) * texWrap;
      if (ring === capacity - 1 || point === pointCount) continue;
      const nextRing = vertex + pointStride;
      const offset = (ring * pointCount + point) * 6;
      indices.set(
        [vertex, nextRing, vertex + 1, vertex + 1, nextRing, nextRing + 1],
        offset,
      );
    }
  }

  const positionAttribute = new BufferAttribute(positions, 3).setUsage(
    DynamicDrawUsage,
  );
  const colorAttribute = new BufferAttribute(colors, 4).setUsage(
    DynamicDrawUsage,
  );
  const texAttribute = new BufferAttribute(texCoords, 2).setUsage(
    DynamicDrawUsage,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("vertexColor", colorAttribute);
  geometry.setAttribute("texCoord", texAttribute);
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);

  const material = createEffectRingMaterial(texture);
  const root = effectMesh(geometry, material);
  root.visible = false;
  let lastAgeSec: number | undefined;
  let lastDeadAtSec: number | undefined;
  return {
    root,
    update(ageSec, deadAtSec) {
      if (ageSec === lastAgeSec && deadAtSec === lastDeadAtSec) return;
      lastAgeSec = ageSec;
      lastDeadAtSec = deadAtSec;
      // Splash::onAdd seeds the timer with one period, so ring zero ejects
      // immediately. Rings born at or after the death tick are excluded.
      const newest = Math.min(
        Math.floor(ageSec * frequency),
        Math.ceil(deadAtSec * frequency) - 1,
      );
      const oldest = Math.max(
        0,
        Math.floor((ageSec - lifetime) * frequency) + 1,
        newest - capacity + 1,
      );
      const strips = Math.max(0, newest - oldest);
      geometry.setDrawRange(0, strips * pointCount * 6);
      root.visible = strips > 0;
      if (!root.visible) return;

      for (let ring = 0; ring <= strips; ring++) {
        const birth = (oldest + ring) / frequency;
        const age = ageSec - birth;
        const progress = age / lifetime;
        const color = sampleColor(colorKeys, colorTimes, progress);
        // Retail applies the ring's life envelope over keyframed RGB.
        const alpha = progress < 0.5 ? progress * 2 : 1 - progress;
        const [radius, height] = ringPosition(
          radialSpeed,
          verticalSpeed,
          age,
          deadAtSec - birth,
          acceleration,
        );
        const v = texFactor * (birth % 1);

        for (let point = 0; point < pointStride; point++) {
          const vertex = ring * pointStride + point;
          // The retail start offset is tangent to the launch direction.
          positions[vertex * 3] =
            radius * cos[point] - startRadius * sin[point];
          positions[vertex * 3 + 1] = height;
          positions[vertex * 3 + 2] =
            -radius * sin[point] - startRadius * cos[point];
          colors[vertex * 4] = color.r;
          colors[vertex * 4 + 1] = color.g;
          colors[vertex * 4 + 2] = color.b;
          colors[vertex * 4 + 3] = alpha;
          texCoords[vertex * 2 + 1] = v;
        }
      }
      positionAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
      texAttribute.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
