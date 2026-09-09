import type { StreamEntity, StreamSnapshot } from "../stream/types";

/** Snapshot membership is stable between simulation ticks, including pause. */
export class ParticleSnapshotIndex {
  private snapshot?: StreamSnapshot;
  readonly entities = new Map<string, StreamEntity>();
  readonly explosions: StreamEntity[] = [];
  readonly shockLances: StreamEntity[] = [];
  readonly trails: StreamEntity[] = [];
  readonly audio: StreamEntity[] = [];

  update(snapshot: StreamSnapshot): boolean {
    if (this.snapshot === snapshot) return false;
    this.snapshot = snapshot;
    this.entities.clear();
    this.explosions.length =
      this.shockLances.length =
      this.trails.length =
      this.audio.length =
        0;
    for (const entity of snapshot.entities) {
      this.entities.set(entity.id, entity);
      if (entity.type === "Explosion") this.explosions.push(entity);
      if (entity.visual?.kind === "shockLance") this.shockLances.push(entity);
      if (entity.maintainEmitterId) this.trails.push(entity);
      if (entity.type === "Explosion" || entity.type === "Projectile")
        this.audio.push(entity);
    }
    return true;
  }
}
