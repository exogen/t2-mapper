import { getShapeSequenceDurationSec } from "./shapeSequences";
import type { Vec3 } from "../collision/terrainCollision";

export interface DebrisEvent {
  id: number;
  time: number;
  expires: number;
  kind: "shape" | "explosion";
  dataBlockId: number;
  shape?: string;
  position: Vec3;
  /** Three-world orientation, as on stream entities. */
  rotation: [number, number, number, number];
  normal: Vec3;
  gravity: number;
}

/** Client effects survive their source ghost. Checkpoints retain inputs, not
 * renderer objects or collision results from an incompletely loaded world. */
export class DebrisHistory {
  events: DebrisEvent[] = [];
  generation = 0;
  gravityChanges: { time: number; gravity: number }[] = [];
  setGravity(time: number, gravity: number): void {
    if (this.gravityChanges.at(-1)?.gravity !== gravity)
      this.gravityChanges.push({ time, gravity });
  }
  private nextId = 0;
  add(event: Omit<DebrisEvent, "id">): void {
    this.events.push({ ...event, id: this.nextId++ });
  }
  prune(time: number): void {
    // Lifetimes differ, so expired events aren't necessarily a prefix.
    let write = 0;
    for (const event of this.events)
      if (event.expires >= time) this.events[write++] = event;
    this.events.length = write;
    const oldest = this.events[0]?.time ?? Infinity;
    const first = this.gravityChanges.findIndex(
      (change) => change.time >= oldest,
    );
    if (first < 0) this.gravityChanges.length = 0;
    else if (first > 0) this.gravityChanges.splice(0, first);
  }
  save() {
    return {
      events: this.events.slice(),
      nextId: this.nextId,
      gravityChanges: this.gravityChanges.slice(),
    };
  }
  restore(saved: ReturnType<DebrisHistory["save"]>): void {
    this.events = saved.events.slice();
    this.nextId = saved.nextId;
    this.gravityChanges = saved.gravityChanges.slice();
    this.generation++;
  }
  clear(): void {
    this.events.length = 0;
    this.gravityChanges.length = 0;
    this.nextId = 0;
    this.generation++;
  }
}

/** Upper bound including descendants and the particles left after removal. */
export function debrisRetention(
  id: number,
  get: (id: number) => Record<string, unknown> | undefined,
  seen = new Set<number>(),
): number {
  if (seen.has(id)) return 0;
  const db = get(id);
  if (!db) return 0;
  seen = new Set(seen).add(id);
  let own =
    typeof db.lifetime === "number"
      ? Math.max(0, db.lifetime + Number(db.lifetimeVariance ?? 0))
      : (Number(db.lifetimeMS ?? 31) +
          Number(db.lifetimeVariance ?? 0) +
          Number(db.lifetimeVarianceMS ?? 0)) *
        0.032;
  if (typeof db.dtsFileName === "string" && db.dtsFileName) {
    const speed = Math.abs(Number(db.playSpeed ?? 20) / 20);
    // Headless checkpoint generation may not have loaded the effect shape.
    const duration =
      getShapeSequenceDurationSec(db.dtsFileName, "ambient") ?? 30;
    if (speed > 0) own = Math.max(own, duration / speed);
  }
  let tail = 0;
  for (const ref of [
    db.debris,
    db.explosion,
    db.emitter0,
    db.emitter1,
    db.particleEmitter,
    ...((db.emitters ?? []) as unknown[]),
    ...((db.particles ?? []) as unknown[]),
    ...((db.subExplosions ?? []) as unknown[]),
  ])
    if (typeof ref === "number")
      tail = Math.max(tail, debrisRetention(ref, get, seen));
  return own + tail + 1;
}
