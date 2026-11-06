import type { LightningEntity } from "../state/gameEntityTypes";
import { createPositionedRoot, type EntityView } from "./entityViews";
import type { GameEngine } from "./gameEngine";
import { markTransformChanged } from "../transformChanges";

/** The native storm's marker/identity; LightningEffects owns world ribbons. */
export function createLightningView(
  entity: LightningEntity,
  engine: GameEngine,
): EntityView {
  const { root } = createPositionedRoot(entity);
  const registration = engine.lightningEffects.add(entity);
  return {
    root,
    update(next) {
      if (next.renderType !== "Lightning") return false;
      if (next.position) root.position.fromArray(next.position);
      if (next.rotation) root.quaternion.fromArray(next.rotation);
      if (next.scale) root.scale.fromArray(next.scale);
      markTransformChanged(root);
      registration.update(next);
      return true;
    },
    dispose: () => registration.dispose(),
  };
}
