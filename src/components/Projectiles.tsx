import {
  applyStreamEntityPose,
  streamRenderFrame,
} from "../stream/interpolateEntity";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { gameEntityStore, isStreamingSource } from "../state/gameEntityStore";
import { engineStore } from "../state/engineStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { useAnisotropy } from "./useAnisotropy";
import { useSettings } from "./SettingsProvider";
import { ProjectilePool } from "./projectiles/ProjectilePool";
import { ProjectileAssets } from "./projectiles/assets";
import { FramePriority } from "./framePriority";
import { createLogger } from "../logger";

const log = createLogger("Projectiles");

/** One stable React lifecycle for every projectile visual. */
export function Projectiles() {
  const anisotropy = useAnisotropy();
  const { animationEnabled } = useSettings();
  const enabled = useRef(animationEnabled);
  useLayoutEffect(() => {
    enabled.current = animationEnabled;
  }, [animationEnabled]);
  const seek = useRef(0);
  const current = useRef<{
    pool: ProjectilePool;
    assets: ProjectileAssets;
    recording: unknown;
    source: unknown;
    mission: string | null;
  } | null>(null);
  useEffect(
    () => () => {
      current.current?.pool.dispose();
      current.current?.assets.dispose();
      current.current = null;
    },
    [],
  );
  useFrame((state3d, delta) => {
    const root = streamPlaybackStore.getState().root;
    if (!root) return;
    const { playback } = engineStore.getState(),
      state = gameEntityStore.getState();
    let runtime = current.current;
    if (
      !runtime ||
      runtime.pool.root !== root ||
      runtime.recording !== playback.recording ||
      runtime.source !== state.dataSource ||
      runtime.mission !== state.missionName
    ) {
      runtime?.pool.dispose();
      runtime?.assets.dispose();
      const assets = new ProjectileAssets(anisotropy, () => enabled.current);
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
      current.current = runtime;
      seek.current = playback.seekNonce;
    }
    if (seek.current !== playback.seekNonce) {
      runtime.pool.reset();
      seek.current = playback.seekNonce;
    }
    runtime.pool.sync(
      isStreamingSource(state.dataSource)
        ? state.streamEntities
        : state.missionEntities,
    );
    runtime.pool.prepare(delta, (root, entity) => {
      if (isStreamingSource(state.dataSource))
        applyStreamEntityPose(
          root,
          entity,
          streamRenderFrame.current?.get(entity.id),
          streamRenderFrame.previous?.get(entity.id),
          streamRenderFrame.interpT,
          state3d.camera,
        );
    });
  }, FramePriority.ShapeAnimation - 1);
  useFrame(({ camera }, delta) => current.current?.pool.update(camera, delta));
  return null;
}
