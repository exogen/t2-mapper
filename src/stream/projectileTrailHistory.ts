import type { Vec3 } from "../collision/terrainCollision";
import { resolveEmitterData } from "../particles/ParticleSystem";
import { TICK_DURATION_MS } from "./streamHelpers";

export interface ProjectileTrailSample {
  projectileId: string;
  emitterId: number;
  slot: "base" | "delayed";
  /** Interval ending on this tick. Retail emits before interpolating it. */
  tick: number;
  from: Vec3;
  to: Vec3;
  velocity: Vec3;
}

interface ProjectileTrailCheckpoint {
  events: ProjectileTrailSample[];
  retentionTicks: number;
}

const MIN_RETENTION_TICKS = 32;

/** Tick-length emission segments outlive their ghost and can warm a seek. */
export class ProjectileTrailHistory {
  events: ProjectileTrailSample[] = [];
  private retentionTicks = MIN_RETENTION_TICKS;
  private readonly knownEmitters = new Set<number>();
  private readonly getDataBlock: (
    id: number,
  ) => Record<string, unknown> | undefined;

  constructor(
    getDataBlock: (id: number) => Record<string, unknown> | undefined,
  ) {
    this.getDataBlock = getDataBlock;
  }

  add(event: ProjectileTrailSample): void {
    const { emitterId } = event;
    if (!this.knownEmitters.has(emitterId)) {
      const raw = this.getDataBlock(emitterId);
      const data = raw && resolveEmitterData(raw, this.getDataBlock);
      if (data) {
        this.knownEmitters.add(emitterId);
        const { lifetimeMS, lifetimeVarianceMS } = data.particles;
        this.retentionTicks = Math.max(
          this.retentionTicks,
          Math.ceil((lifetimeMS + lifetimeVarianceMS) / TICK_DURATION_MS) + 1,
        );
      }
    }
    this.events.push(event);
  }

  prune(tick: number): void {
    const oldest = tick - this.retentionTicks;
    let expired = 0;
    while (expired < this.events.length && this.events[expired].tick < oldest)
      expired++;
    if (expired) this.events.splice(0, expired);
  }

  save(): ProjectileTrailCheckpoint | undefined {
    if (this.events.length) {
      return {
        events: this.events.slice(),
        retentionTicks: this.retentionTicks,
      };
    }
  }

  restore(
    state: ProjectileTrailCheckpoint | undefined,
    remap: (id: string) => string,
  ): void {
    this.events =
      state?.events.map((event) => ({
        ...event,
        projectileId: remap(event.projectileId),
      })) ?? [];
    this.retentionTicks = state?.retentionTicks ?? MIN_RETENTION_TICKS;
    this.knownEmitters.clear();
  }

  clear(): void {
    this.events.length = 0;
    this.retentionTicks = MIN_RETENTION_TICKS;
    this.knownEmitters.clear();
  }
}
