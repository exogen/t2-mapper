import type { PrecipitationConfig, WeatherPoint } from "./types";
import { precipitationPercentage } from "./data";

export { precipitationPercentage } from "./data";

export interface PrecipitationDrop {
  position: WeatherPoint;
  startPosition: WeatherPoint;
  offset: WeatherPoint;
  speed: number;
  colorIndex: number;
  textureIndex: number;
  dropType: number;
  startDiff: number;
  active: boolean;
  invalid: boolean;
  alpha: number;
  size: number;
  startTime: number;
  endTime: number;
}

export interface PrecipitationContext {
  /** Render camera, wind direction and player velocity use Torque axes. */
  camera: WeatherPoint;
  wind?: WeatherPoint;
  /** Only a Player control object changes the native velocity box. */
  playerVelocity?: WeatherPoint;
  /** A partially submerged control object raises the bottom of the box. */
  liquidHeight?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function drop(): PrecipitationDrop {
  return {
    position: [0, 0, 0],
    startPosition: [0, 0, 0],
    offset: [0, 0, 1],
    speed: 0,
    colorIndex: 0,
    textureIndex: 0,
    dropType: 1,
    startDiff: 1,
    active: false,
    invalid: true,
    alpha: 0,
    size: 0,
    startTime: 0,
    endTime: 0,
  };
}

/**
 * Retail precipitation, ported from FUN_00681a40 (rain/snow), 00682650
 * (sand), and 00682910 (the velocity box). Particle speeds are increments
 * PER RENDER, not metres/second: the retail executable never multiplies
 * them by dt. frameScale preserves that at 1x and applies playback rate;
 * world time separately controls storms, sand lifetime and the falling
 * player's rain-speed correction.
 */
export class PrecipitationSimulation {
  readonly drops: PrecipitationDrop[] = [];
  readonly min: WeatherPoint = [0, 0, 0];
  readonly max: WeatherPoint = [0, 0, 0];
  readonly offset: WeatherPoint = [0, 0, 1];
  readonly center: WeatherPoint = [0, 0, 0];
  readonly shift: WeatherPoint = [0, 0, 0];
  drawCount = 0;
  revision = 0;
  private lastCamera?: WeatherPoint;
  private randomHeight = true;
  private lastTime?: number;
  private lastHeight = 0;
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  reset(): void {
    this.drops.length = 0;
    this.drawCount = 0;
    this.lastCamera = undefined;
    this.randomHeight = true;
    this.lastTime = undefined;
    this.lastHeight = 0;
    this.offset[0] = this.offset[1] = 0;
    this.offset[2] = 1;
    this.center.fill(0);
    this.shift.fill(0);
    this.revision++;
  }

  update(
    config: PrecipitationConfig,
    now: number,
    frameScale: number,
    context: PrecipitationContext,
  ): void {
    const maximum = clamp(Math.trunc(config.maxDrops), 0, 2000);
    // Retail has two independent counters: the loop bound at +0x34f90,
    // and the respawn threshold at +0x34fa4. setPercentage changes only
    // the former; updateStorm changes only the latter (006831d0/00683360).
    // In particular, fading a zero draw bound back in must retain that zero.
    this.drawCount = clamp(
      Math.trunc(config.drawCount ?? maximum * config.percentage),
      0,
      2000,
    );
    const count = clamp(
      Math.trunc(
        config.storm
          ? maximum * precipitationPercentage(config, now)
          : (config.spawnCount ?? maximum * config.percentage),
      ),
      0,
      2000,
    );
    // The native array always has 2000 slots. A later InitMask may lower
    // maxDrops without changing either retained counter or existing drops.
    const capacity = Math.max(maximum, this.drawCount, count);
    while (this.drops.length < capacity) this.drops.push(drop());
    if (!config.enabled) {
      this.drawCount = 0;
      this.revision++;
      return;
    }
    if (config.type === 2) {
      this.sand(config, now, frameScale, count);
      this.lastTime = now;
      this.revision++;
      return;
    }
    const { camera } = context;
    const { renderPercentage, zVelocity, offsetX, offsetY } = this.velocityBox(
      config,
      context,
    );
    let minSpeed = 0;
    if (zVelocity < 0 && config.type === 0)
      minSpeed =
        (now - (this.lastTime ?? now)) * zVelocity - config.minVelocity;
    for (let index = 0; index < this.drawCount; index++) {
      const p = this.drops[index];
      if (index >= count && !p.active) continue;
      const speed = Math.min(p.speed, minSpeed || p.speed) * frameScale;
      p.position[0] += this.shift[0] + p.offset[0] * speed;
      p.position[1] += this.shift[1] + p.offset[1] * speed;
      p.position[2] += this.shift[2] + speed;
      const inside = p.position.every(
        (value, i) => value >= this.min[i] && value < this.max[i],
      );
      if (p.invalid || !inside) {
        if (index >= count) {
          p.active = false;
          continue;
        }
        const radius = Math.min(
          config.maxRadius * (1 - Math.abs(offsetX)),
          config.maxRadius * (1 - Math.abs(offsetY)),
        );
        const random1 = this.random(),
          random2 = this.random(),
          random3 = this.random();
        let x = this.random() * 2 - 1,
          y = this.random() * 2 - 1;
        const length = Math.hypot(x, y);
        if (length > 0) {
          x /= length;
          y /= length;
        } else {
          x = 1;
          y = 0;
        }
        p.speed =
          -config.minVelocity -
          (config.maxVelocity - config.minVelocity) * random3;
        let height: number, radial: number;
        if (
          random1 > 1 - renderPercentage ||
          (this.random() < config.topBoxDrawPer && renderPercentage < -0.4)
        ) {
          if (renderPercentage < -0.4) p.speed *= config.frontSpeedPer * 2.5;
          height = this.randomHeight
            ? (this.max[2] - 5) * (this.random() * 2 - 1)
            : this.max[2] - 5;
          p.dropType = 1;
          radial = radius * clamp(random2 < 0.2 ? random3 : random2, 0.01, 1);
        } else if (random1 > -renderPercentage) {
          height = random3 * this.max[2];
          radial = radius * config.frontRadiusPer;
          p.speed *= config.frontSpeedPer;
          p.dropType = 2;
        } else {
          height = this.min[2] + config.bottomDrawHeight;
          radial = radius * random3;
          p.speed *= config.bottomSpeedPer;
          p.dropType = 3;
        }
        p.colorIndex = clamp(
          Math.ceil(config.colors.length * random2) - 1,
          0,
          config.colors.length - 1,
        );
        p.position[0] = camera[0] + this.center[0] + x * radial;
        p.position[1] = camera[1] + this.center[1] + y * radial;
        p.position[2] = height;
        p.startPosition = [...p.position];
        p.startDiff = height - camera[2] + 20;
        p.offset = [...this.offset];
        let textureRandom = this.random();
        if (textureRandom > 0.99995 && textureRandom < 0.99999)
          textureRandom = 1.01;
        p.textureIndex = clamp(Math.ceil(15 * textureRandom) - 1, 0, 15);
        p.active = true;
        p.invalid = false;
      }
      p.alpha =
        p.dropType === 1
          ? clamp(1 - (p.position[2] - camera[2]) / p.startDiff, 0, 1)
          : 1;
    }
    this.randomHeight = false;
    this.lastTime = now;
    this.revision++;
  }

  private velocityBox(
    config: PrecipitationConfig,
    context: PrecipitationContext,
  ) {
    const { camera, wind, playerVelocity, liquidHeight } = context;
    const radius = config.maxRadius;
    const divHeight = config.divHeightVal || 1;
    this.offset[0] = (wind?.[0] ?? 0) * config.offsetSpeed;
    this.offset[1] = (wind?.[1] ?? 0) * config.offsetSpeed;
    this.offset[2] = 1;
    this.center[0] = this.offset[0] * radius;
    this.center[1] = this.offset[1] * radius;
    this.center[2] = 0;
    this.shift.fill(0);
    if (
      this.lastCamera &&
      Math.hypot(...camera.map((value, i) => value - this.lastCamera![i])) >
        radius / 2
    )
      for (let i = 0; i < 3; i++)
        this.shift[i] = camera[i] - this.lastCamera[i];
    this.lastCamera = [...camera];
    const bottom =
      liquidHeight == null
        ? camera[2] - radius / divHeight
        : liquidHeight + config.sizeY;
    let offsetX = 0,
      offsetY = 0,
      renderPercentage = 1,
      zVelocity = 0;
    if (!playerVelocity) {
      this.min[0] = camera[0] - radius;
      this.min[1] = camera[1] - radius;
      this.min[2] = bottom;
      this.max[0] = camera[0] + radius;
      this.max[1] = camera[1] + radius;
      this.max[2] = camera[2] + radius / divHeight;
      return { renderPercentage, zVelocity, offsetX, offsetY };
    }
    const [vx, vy, vz] = playerVelocity;
    offsetX = clamp(vx / 40, -config.movingBoxPer, config.movingBoxPer);
    offsetY = clamp(vy / 40, -config.movingBoxPer, config.movingBoxPer);
    const xySpeed = Math.hypot(vx, vy);
    const radiusZ = radius * (xySpeed > 1 ? clamp(40 / xySpeed, 0.01, 1) : 1);
    let top = radiusZ / divHeight;
    if (top > this.lastHeight && top - this.lastHeight > 5) top += 5;
    this.lastHeight = top;
    for (let i = 0; i < 2; i++) {
      const offset = i === 0 ? offsetX : offsetY;
      this.min[i] =
        camera[i] - radius + (config.sizeBigBox ? radius * offset : 0);
      this.max[i] =
        camera[i] + radius + (config.sizeBigBox ? radius * offset : 0);
    }
    this.min[2] = config.sizeBigBox ? bottom : camera[2] - radius / divHeight;
    this.max[2] = camera[2] + (config.sizeBigBox ? top : radius / divHeight);
    const speed = Math.hypot(vx, vy, vz);
    const random = this.random();
    zVelocity = vz;
    if (speed >= config.topBoxSpeed && random >= 0.25)
      renderPercentage =
        vz / speed +
        (speed < config.frontBoxSpeed
          ? 1 -
            (speed - config.topBoxSpeed) /
              (config.frontBoxSpeed - config.topBoxSpeed)
          : 0);
    this.center[0] = speed
      ? (vx / speed) * Math.abs(Math.trunc(offsetX * radius))
      : 0;
    this.center[1] = speed
      ? (vy / speed) * Math.abs(Math.trunc(offsetY * radius))
      : 0;
    this.center[2] = speed ? (vz / speed) * radius : 0;
    // onNewDataBlock 00681620 stores the mean, then multiplies by 0.65.
    const averageSpeed =
      config.averageSpeed ??
      (config.minVelocity + config.maxVelocity) * 0.5 * 0.65;
    if (averageSpeed && (this.offset[0] || this.offset[1])) {
      this.center[0] += (radius / averageSpeed) * this.offset[0];
      this.center[1] += (radius / averageSpeed) * this.offset[1];
      this.center[2] = 0;
    }
    return { renderPercentage, zVelocity, offsetX, offsetY };
  }

  private sand(
    config: PrecipitationConfig,
    now: number,
    frameScale: number,
    count: number,
  ): void {
    for (let index = 0; index < this.drawCount; index++) {
      const p = this.drops[index];
      if (p.invalid) {
        // Retail's empty drop constructor (00680a50) leaves sand's
        // startPos/time fields undefined. Initialize them rather than
        // reproducing native uninitialized-memory reads.
        p.startPosition = [
          this.random() * 2 - 1,
          this.random() * 2 - 1,
          this.random() * 2 - 1,
        ];
        p.endTime = -1;
        p.invalid = false;
      }
      if (index >= count && !p.active) continue;
      p.offset[0] += this.offset[0] * frameScale;
      p.offset[1] += this.offset[1] * frameScale;
      if (p.endTime < now) {
        if (index >= count) {
          p.active = false;
          continue;
        }
        const previousDuration = p.endTime - p.startTime;
        const phase =
          previousDuration > 0 ? (now - p.endTime) % previousDuration : 0;
        p.startTime = now - phase;
        p.endTime =
          now + config.minVelocity * this.random() + config.maxVelocity - phase;
        p.size = config.maxSize * this.random();
        p.offset.fill(0);
        p.colorIndex = clamp(
          Math.ceil(config.colors.length * this.random()) - 1,
          0,
          config.colors.length - 1,
        );
        p.active = true;
      }
      const progress = clamp(
        (p.endTime - now) / Math.max(0.0001, p.endTime - p.startTime),
        0,
        1,
      );
      p.alpha = 1 - progress;
      p.position[0] = p.startPosition[0] * config.maxRadius + p.offset[0];
      p.position[1] = p.startPosition[1] * config.maxRadius + p.offset[1];
      p.position[2] =
        p.startPosition[2] * progress * config.maxRadius - config.maxRadius;
    }
  }
}
