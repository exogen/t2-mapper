import { Vector4 } from "three";
import { setDTSRenderSettings } from "../dts/dtsModel";
import { settingsStore } from "../state/settingsStore";
import { FramePriority } from "./framePriority";
import { combineCleanups, reaction } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

/**
 * Camera-scoped DTS level-of-detail settings every frame, and the one
 * shared DTS draw pool for scenery, entities, mounts and effects
 * (disable it with `?dtsInstancing=0`).
 */
export function installDTSRendering(engine: GameEngine): () => void {
  const viewport = new Vector4();
  const pooled =
    new URLSearchParams(window.location.search).get("dtsInstancing") !== "0";
  return combineCleanups(
    engine.scheduler.add(FramePriority.PostCamera, ({ camera, renderer }) => {
      setDTSRenderSettings(
        camera,
        renderer.getViewport(viewport).w * renderer.getPixelRatio(),
        settingsStore.getState().lodEnabled,
      );
    }),
    reaction(
      settingsStore,
      (state) => state.lodEnabled,
      () => engine.invalidate(),
    ),
    pooled
      ? engine.withHost(({ scene, renderer }) => {
          let instances: { dispose(): void } | null = null;
          let stopped = false;
          // Loaded on demand, like the rest of the shape pipeline. It wraps
          // the engine's render hooks, so it prepares after them and
          // restores before them.
          void import("../dts/dtsAnimatedInstances").then(
            ({ installDTSAnimatedInstances }) => {
              if (!stopped)
                instances = installDTSAnimatedInstances(scene, renderer);
            },
          );
          return () => {
            stopped = true;
            instances?.dispose();
          };
        })
      : undefined,
  );
}
