import { ShadowPoolRuntime } from "./shadowPoolRuntime";
import { FramePriority } from "./framePriority";
import { combineCleanups } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

/**
 * Queue projected shadows after the scene's final matrix update. Draw their
 * atlases at the start of the next frame, while that complete pose is intact.
 */
export function installShadowPool(engine: GameEngine): () => void {
  const runtime = new ShadowPoolRuntime();
  return combineCleanups(
    () => runtime.dispose(),
    engine.withHost(({ scene }) => {
      scene.add(runtime.decals);
      return () => scene.remove(runtime.decals);
    }),
    engine.scheduler.add(FramePriority.ShadowAtlas, ({ renderer }) =>
      runtime.renderPending(renderer),
    ),
    engine.onBeforeRender((renderer, scene, camera) =>
      runtime.update(renderer, scene, camera),
    ),
  );
}
