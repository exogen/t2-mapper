import type { ParticleEmissionDummyEntity } from "../state/gameEntityTypes";
import { markTransformChanged } from "../transformChanges";
import { createDebugMarker, showWhileDebugTourTarget } from "./debugVisuals";
import { createPositionedRoot, type EntityView } from "./entityViews";
import type { GameEngine } from "./gameEngine";

/** The positioned driver; AmbientParticles owns its world-space particles. */
export function createParticleEmissionDummyView(
  entity: ParticleEmissionDummyEntity,
  engine: GameEngine,
): EntityView {
  const { root, model } = createPositionedRoot(entity);
  const driver = engine.ambientParticles.add(root, entity);
  const stopDebug = showWhileDebugTourTarget(model, entity.id, () =>
    createDebugMarker(1.5),
  );
  return {
    root,
    update(next) {
      if (next.renderType !== "ParticleEmissionDummy") return false;
      if (next.position) root.position.fromArray(next.position);
      if (next.rotation) root.quaternion.fromArray(next.rotation);
      if (next.scale) root.scale.fromArray(next.scale);
      markTransformChanged(root);
      driver.update(next);
      return true;
    },
    dispose(reason) {
      stopDebug();
      driver.dispose(reason === "removed");
    },
  };
}
