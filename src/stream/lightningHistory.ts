import type { LightningStrike } from "../weather/types";

/** Viewer seek-input retention, not a native sound-distance cull. Native
 * thunder is unpositioned; the renderer keeps an already scheduled sound
 * independently. Keep at least 30 seconds of thunder inputs to rebuild
 * nearby delayed sounds after seeks, extended for authored long ranges. */
export function lightningRetention(event: LightningStrike): number {
  if (!event.config.thunderSounds.length) return 1.6;
  const distance = Math.max(
    0,
    ...event.config.thunderSounds.map((sound) => sound.maxDist),
  );
  return Math.max(30, distance / 330 + 0.1);
}

/** Retain inputs, not meshes or loaded collision results, across seeks. */
export class LightningHistory {
  events: LightningStrike[] = [];
  generation = 0;
  private nextId = 0;

  add(event: Omit<LightningStrike, "id">): void {
    this.events.push({ ...event, id: this.nextId++ });
  }

  prune(now: number): void {
    if (!this.events.length) return;
    this.events = this.events.filter(
      (event) => event.time + lightningRetention(event) >= now,
    );
  }

  save() {
    return { events: this.events.slice(), nextId: this.nextId };
  }

  restore(
    saved: ReturnType<LightningHistory["save"]>,
    remap: (id: string) => string = (id) => id,
  ): void {
    this.events = saved.events.map((event) => ({
      ...event,
      stormId: remap(event.stormId),
      targetId: event.targetId ? remap(event.targetId) : undefined,
    }));
    this.nextId = saved.nextId;
    this.generation++;
  }

  clear(): void {
    this.events = [];
    this.nextId = 0;
    this.generation++;
  }
}
