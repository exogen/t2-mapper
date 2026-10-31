import {
  applyStreamEntityPose,
  streamRenderFrame,
} from "../stream/interpolateEntity";
import { gameEntityStore, isStreamingSource } from "../state/gameEntityStore";
import { engineStore } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { ProjectilePool } from "../projectiles/ProjectilePool";
import { ProjectileAssets } from "../projectiles/assets";
import { createLogger } from "../logger";
import { combineCleanups } from "./storeReaction";
import { FramePriority } from "./framePriority";
import type { GameEngine } from "./gameEngine";

const log = createLogger("Projectiles");

/**
 * Every projectile visual, in one pool under the entity root: rebuilt for
 * each recording, data source and mission, reset on a seek.
 */
export function installProjectiles(engine: GameEngine): () => void {
  let seek = 0;
  let current: {
    pool: ProjectilePool;
    assets: ProjectileAssets;
    recording: unknown;
    source: unknown;
    mission: string | null;
  } | null = null;
  return combineCleanups(
    () => {
      current?.pool.dispose();
      current?.assets.dispose();
      current = null;
    },
    engine.scheduler.add(
      FramePriority.ProjectilePose,
      ({ camera, renderer, delta }) => {
        const root = streamPlaybackStore.getState().root;
        if (!root) return;
        const { playback } = engineStore.getState(),
          state = gameEntityStore.getState();
        if (playback.status === "seeking") return;
        let runtime = current;
        if (
          !runtime ||
          runtime.pool.root !== root ||
          runtime.recording !== playback.recording ||
          runtime.source !== state.dataSource ||
          runtime.mission !== state.missionName
        ) {
          runtime?.pool.dispose();
          runtime?.assets.dispose();
          const assets = new ProjectileAssets(
            renderer.capabilities.getMaxAnisotropy(),
            () => settingsStore.getState().animationEnabled,
          );
          const pool = new ProjectilePool(
            root,
            (entity) => assets.factory(entity),
            (error) => log.error("Failed to load projectile: %o", error),
          );
          runtime = {
            pool,
            assets,
            recording: playback.recording,
            source: state.dataSource,
            mission: state.missionName,
          };
          current = runtime;
          seek = playback.seekNonce;
        }
        if (seek !== playback.seekNonce) {
          runtime.pool.reset();
          seek = playback.seekNonce;
        }
        const streaming = isStreamingSource(state.dataSource);
        runtime.pool.sync(
          streaming ? state.streamEntities : state.missionEntities,
        );
        runtime.pool.prepare(delta, (root, entity) => {
          if (streaming)
            applyStreamEntityPose(
              root,
              entity,
              streamRenderFrame.current?.get(entity.id),
              streamRenderFrame.previous?.get(entity.id),
              streamRenderFrame.interpT,
              camera,
              streamRenderFrame.aimCorrection,
            );
        });
      },
    ),
    engine.scheduler.add(FramePriority.PostCamera, ({ camera, delta }) => {
      if (engineStore.getState().playback.status === "seeking") return;
      current?.pool.update(camera, delta);
    }),
  );
}
