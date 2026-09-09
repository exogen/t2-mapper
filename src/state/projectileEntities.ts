import { projectileClassNames } from "../stream/entityClassification";
import type { GameEntity, ShapeEntity } from "./gameEntityTypes";

export type ProjectileEntity =
  | Extract<
      GameEntity,
      {
        renderType:
          | "Sprite"
          | "Tracer"
          | "Flare"
          | "Beam"
          | "LinkBeam"
          | "ShockLance"
          | "Explosion";
      }
    >
  | ShapeEntity;

/** Projectile classification is independent of its visual representation. */
export function isProjectileEntity(
  entity: GameEntity,
): entity is ProjectileEntity {
  switch (entity.renderType) {
    case "Sprite":
    case "Tracer":
    case "Flare":
    case "Beam":
    case "LinkBeam":
    case "ShockLance":
    case "Explosion":
      return true;
    case "Shape":
      return projectileClassNames.has(entity.className);
    default:
      return false;
  }
}
