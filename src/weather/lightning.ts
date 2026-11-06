/**
 * Retail Tribes2.exe lightning math. Addresses refer to build 25034:
 * 0x627f00 (strike construction), 0x629480 (node generation),
 * 0x629fb0 (minor nodes), 0x62a160/0x62a990 (splits), 0x62aca0 (age).
 * The engine's cosmetic random stream is not recorded; callers supply a
 * stable per-event stream so the same recorded strike survives a seek.
 */
import { Vector3 } from "three";
import type { LightningConfig, WeatherColor, WeatherPoint } from "./types";

export const LIGHTNING_STRIKE_LIFETIME = 1.6;
export const LIGHTNING_THUNDER_SPEED = 330;

export interface LightningNode {
  point: WeatherPoint;
  direction: WeatherPoint;
}

export interface LightningLine {
  points: WeatherPoint[];
  /** U restarts in each minor-node segment, as in renderSegment 0x629bc0. */
  u: number[];
  width: number;
  color: WeatherColor;
}

function vector(point: WeatherPoint): Vector3 {
  return new Vector3(...point);
}

function point(value: Vector3): WeatherPoint {
  return value.toArray();
}

/** MathUtils::randomDir (0x554030), including its nonuniform angular draw. */
export function lightningRandomDirection(
  axis: WeatherPoint,
  minDegrees: number,
  maxDegrees: number,
  random: () => number,
): WeatherPoint {
  const direction = vector(axis).normalize();
  const side = new Vector3(direction.y, -direction.x, 0);
  // Retail createOrientFromDir 0x553d00 uses +X when its safeMagnitude
  // considers the cross product zero (each squared component <=0.0001).
  if (side.x * side.x <= 0.0001 && side.y * side.y <= 0.0001) side.set(1, 0, 0);
  side.normalize();
  const theta =
    (((maxDegrees - minDegrees) * random() + minDegrees) * Math.PI) / 180;
  const phi = random() * Math.PI * 2;
  // Quaternion::setMatrix 0x54d500 uses Torque's opposite rotation sign.
  return point(
    direction
      .clone()
      .applyAxisAngle(side, -theta)
      .applyAxisAngle(direction, -phi),
  );
}

export function generateLightningNodes(
  start: WeatherPoint,
  end: WeatherPoint,
  count: number,
  maxAngle: number,
  random: () => number,
): LightningNode[] {
  const nodes: LightningNode[] = [];
  const distance = vector(end).distanceTo(vector(start));
  const minLength = distance / (count - 1);
  const maxLength = minLength / Math.cos((maxAngle * Math.PI) / 180);
  let direction = point(vector(end).sub(vector(start)).normalize());
  for (let i = 0; i < count; i++) {
    let current: WeatherPoint;
    if (i === 0) current = [...start];
    else if (i === count - 1) current = [...end];
    else {
      const length = minLength + random() * (maxLength - minLength);
      const axis = lightningRandomDirection(direction, 0, maxAngle, random);
      current = point(
        vector(nodes[i - 1].point).addScaledVector(vector(axis), length),
      );
      direction = point(vector(end).sub(vector(current)).normalize());
    }
    nodes.push({ point: current, direction: [...direction] });
  }
  return nodes;
}

interface Branch {
  major: LightningNode[];
  minor: LightningNode[][];
  width: number;
  minorCount: number;
  minorAngle: number;
}

function generateMinor(branch: Branch, random: () => number): void {
  branch.minor = branch.major
    .slice(0, -1)
    .map((node, i) =>
      generateLightningNodes(
        node.point,
        branch.major[i + 1].point,
        branch.minorCount,
        branch.minorAngle,
        random,
      ),
    );
}

/** A primary bolt and the split ribbons which share its color/fade state. */
export class LightningBolt {
  readonly primary: Branch;
  readonly branches: Branch[] = [];
  readonly renderTime: number;
  elapsedTime = 0;
  started = false;
  fading = false;
  percentFade = 0;
  private readonly random: () => number;

  constructor(
    start: WeatherPoint,
    end: WeatherPoint,
    width: number,
    random: () => number,
  ) {
    this.random = random;
    this.primary = {
      major: generateLightningNodes(start, end, 10, 30, random),
      minor: [],
      width,
      minorCount: 4,
      minorAngle: 15,
    };
    generateMinor(this.primary, random);
    // 0x62a990: test every major segment, then recursively split to depth 4.
    for (let i = 0; i < this.primary.major.length - 1; i++) {
      if (random() > 0.3) continue;
      const from = this.primary.major[i].point;
      const next = this.primary.major[i + 1].point;
      const axis = vector(next).sub(vector(from));
      const length = axis.length();
      const direction = lightningRandomDirection(
        point(axis.normalize()),
        20,
        40,
        random,
      );
      const splitEnd = point(
        vector(from).addScaledVector(
          vector(direction),
          (0.5 + random()) * length,
        ),
      );
      this.split(from, splitEnd, 4, width * 0.3);
    }
    this.renderTime = random() * 0.25;
  }

  private split(
    start: WeatherPoint,
    end: WeatherPoint,
    depth: number,
    width: number,
  ): void {
    if (depth === 0 || this.random() > 0.7) return;
    width = Math.max(0.75, width);
    const branch: Branch = {
      major: generateLightningNodes(start, end, 3, 30, this.random),
      minor: [],
      width,
      minorCount: 3,
      minorAngle: 10,
    };
    generateMinor(branch, this.random);
    this.branches.push(branch);
    const axis = vector(end).sub(vector(start));
    const length = axis.length();
    const direction = point(axis.normalize());
    const next1 = lightningRandomDirection(direction, 10, 45, this.random);
    const end1 = point(
      vector(end).addScaledVector(
        vector(next1),
        (0.5 + this.random()) * length,
      ),
    );
    const next2 = lightningRandomDirection(direction, 10, 45, this.random);
    const end2 = point(
      vector(end).addScaledVector(
        vector(next2),
        (0.5 + this.random()) * length,
      ),
    );
    this.split(end, end1, depth - 1, width * 0.3);
    this.split(end, end2, depth - 1, width * 0.3);
  }

  /** Preserve retail's strict thresholds and reset-on-first-render behavior. */
  update(delta: number): void {
    if (!(delta > 0)) return;
    this.elapsedTime += delta;
    if (this.elapsedTime > 0.2) {
      this.fading = true;
      this.percentFade = this.elapsedTime + 0.2;
    }
    if (this.elapsedTime > this.renderTime && !this.started) {
      this.started = true;
      this.fading = false;
      this.elapsedTime = 0;
    }
  }

  lines(config: LightningConfig, regenerate = true): LightningLine[] {
    if (!this.started) return [];
    if (!this.fading && regenerate) {
      generateMinor(this.primary, this.random);
      for (const branch of this.branches) generateMinor(branch, this.random);
    }
    const color: WeatherColor = this.fading
      ? [
          config.fadeColor[0],
          config.fadeColor[1],
          config.fadeColor[2],
          Math.max(0, 1 - this.percentFade),
        ]
      : [...config.color];
    return [this.primary, ...this.branches].map((branch) => {
      const points: WeatherPoint[] = [],
        u: number[] = [];
      for (let segment = 0; segment < branch.minor.length; segment++) {
        const nodes = branch.minor[segment];
        const count =
          nodes.length - (segment === branch.minor.length - 1 ? 0 : 1);
        for (let i = 0; i < count; i++) {
          points.push(nodes[i].point);
          u.push(i & 1);
        }
      }
      return { points, u, width: branch.width, color };
    });
  }
}

export class LightningStrikeSimulation {
  readonly bolts: LightningBolt[];
  age = 0;

  constructor(
    config: LightningConfig,
    end: WeatherPoint,
    random: () => number,
  ) {
    this.bolts = Array.from({ length: 3 }, () => {
      // processEvent 0x627f00: three independently jittered cloud starts.
      const y = end[1] + (random() * 2 - 1) * config.boltStartRadius;
      const x = end[0] + (random() * 2 - 1) * config.boltStartRadius;
      const start: WeatherPoint = [
        x,
        y,
        config.position[2] + config.scale[2] * 0.5,
      ];
      return new LightningBolt(start, end, config.strikeWidth, random);
    });
  }

  update(delta: number): void {
    if (!(delta > 0)) return;
    this.age += delta;
    for (const bolt of this.bolts) bolt.update(delta);
  }

  /** Reconstruct a newly mounted recorded strike without replaying old audio. */
  advanceTo(age: number, config: LightningConfig): void {
    for (
      let remaining = Math.min(LIGHTNING_STRIKE_LIFETIME, Math.max(0, age));
      remaining > 0;
    ) {
      const step = Math.min(0.032, remaining);
      this.update(step);
      for (const bolt of this.bolts) bolt.lines(config);
      remaining -= step;
    }
  }

  lines(config: LightningConfig, regenerate = true): LightningLine[] {
    return this.bolts.flatMap((bolt) => bolt.lines(config, regenerate));
  }
}

/** Retail's thunder timing is horizontal distance, not full 3-D distance. */
export function lightningThunderDelay(
  camera: WeatherPoint,
  impact: WeatherPoint,
): number {
  const distance = Math.hypot(camera[0] - impact[0], camera[1] - impact[1]);
  return distance <= LIGHTNING_THUNDER_SPEED * 0.03
    ? 0
    : distance / LIGHTNING_THUNDER_SPEED;
}

/** Server processTick 0x627d30: whole 32 ms ticks, strict `>` comparison. */
export class ExploreLightningScheduler {
  private remainder = 0;
  private thinkMS = 0;

  update(delta: number, strikesPerMinute: number): number {
    if (
      !(delta > 0) ||
      !(strikesPerMinute > 0) ||
      !Number.isFinite(strikesPerMinute)
    )
      return 0;
    this.remainder += delta * 1000;
    const period = Math.max(1, Math.trunc(60_000 / strikesPerMinute));
    let strikes = 0;
    while (this.remainder >= 32) {
      this.remainder -= 32;
      this.thinkMS += 32;
      if (this.thinkMS > period) {
        this.thinkMS -= period;
        strikes++;
      }
    }
    return strikes;
  }
}
