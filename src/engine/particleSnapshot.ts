import type { StreamEntity, StreamSnapshot } from "../stream/types";

/** Entity membership is stable between ticks and throughout the debrief. */
export class ParticleSnapshotIndex {
  private source?: StreamEntity[];
  readonly entities = new Map<string, StreamEntity>();
  readonly explosions: StreamEntity[] = [];
  readonly splashes: StreamEntity[] = [];
  readonly shockLances: StreamEntity[] = [];
  readonly trails: StreamEntity[] = [];
  readonly seekerLaunches: StreamEntity[] = [];
  readonly projectiles: StreamEntity[] = [];

  getEntity(snapshot: StreamSnapshot, id: string): StreamEntity | undefined {
    return this.source === snapshot.entities
      ? this.entities.get(id)
      : snapshot.entities.find((entity) => entity.id === id);
  }

  update(snapshot: StreamSnapshot): boolean {
    if (this.source === snapshot.entities) return false;
    this.source = snapshot.entities;
    this.entities.clear();
    this.explosions.length =
      this.splashes.length =
      this.shockLances.length =
      this.trails.length =
      this.seekerLaunches.length =
      this.projectiles.length =
        0;
    for (const entity of snapshot.entities) {
      this.entities.set(entity.id, entity);
      if (entity.type === "Explosion") this.explosions.push(entity);
      if (entity.type === "Splash") this.splashes.push(entity);
      if (entity.visual?.kind === "shockLance") this.shockLances.push(entity);
      if (
        entity.bubbleEmitterId ||
        (entity.projectileTrailMode !== "tick" &&
          (entity.maintainEmitterId || entity.seekerLaunch?.delayEmitterId))
      )
        this.trails.push(entity);
      if (entity.seekerLaunch) this.seekerLaunches.push(entity);
      if (entity.type === "Projectile") this.projectiles.push(entity);
    }
    return true;
  }
}
