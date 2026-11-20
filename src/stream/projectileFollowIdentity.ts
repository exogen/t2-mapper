import { isTrackableProjectile } from "./interpolateEntity";
import { streamTimeToTick } from "./streamHelpers";
import type { StreamEntity } from "./types";

/** A projectile's ghost lifetime, stable when a demo seek assigns new entity IDs. */
export interface ProjectileFollowIdentity {
  ghostIndex: number;
  spawnTick: number;
}

export function projectileFollowIdentity(
  entity: StreamEntity | undefined,
): ProjectileFollowIdentity | undefined {
  if (
    !isTrackableProjectile(entity) ||
    entity.ghostIndex == null ||
    !Number.isSafeInteger(entity.ghostIndex) ||
    entity.ghostIndex < 0 ||
    entity.spawnTimeSec == null
  )
    return undefined;
  const spawnTick = streamTimeToTick(entity.spawnTimeSec);
  if (Number.isSafeInteger(spawnTick) && spawnTick >= 0)
    return { ghostIndex: entity.ghostIndex, spawnTick };
}

export function findFollowedProjectile(
  entities: ReadonlyMap<string, StreamEntity> | null,
  { ghostIndex, spawnTick }: ProjectileFollowIdentity,
): StreamEntity | undefined {
  if (!entities) return undefined;
  for (const entity of entities.values()) {
    if (
      entity.ghostIndex === ghostIndex &&
      projectileFollowIdentity(entity)?.spawnTick === spawnTick
    )
      return entity;
  }
}
