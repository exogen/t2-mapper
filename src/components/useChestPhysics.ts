import { useEffect, useRef } from "react";
import type { DTSShape } from "../dts/dtsModel";
import { createChestPhysics } from "../player/chestPhysics";
import { useJiggle } from "../state/jiggleStore";
import { useFeatures } from "./FeaturesProvider";
import { resolvePlayerBodyType } from "../player/playerBodyType";
import { useEngineStoreApi } from "../state/engineStore";
import type { PlayerEntity } from "../state/gameEntityTypes";

export function useChestPhysics(scene: DTSShape, player: PlayerEntity) {
  const { jiggle } = useFeatures();
  const engineStore = useEngineStoreApi();
  const { shapeName, dataBlock, dataBlockId } = player;
  const update = useRef<((time: number, resetKey: number) => void) | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!jiggle || !shapeName) return;
    const playback =
      engineStore.getState().playback.recording?.streamingPlayback;
    const bodyType = resolvePlayerBodyType(
      { shapeName, dataBlock, dataBlockId },
      (id) => playback?.getDataBlockData(id),
    );
    const physics = createChestPhysics(scene, shapeName);
    if (!physics) return;
    update.current = (time, resetKey) => {
      const { sizes, firmness } = useJiggle.getState();
      physics.update(time, resetKey, sizes[bodyType], 1 - firmness / 100);
    };
    return () => {
      update.current = undefined;
      physics.dispose();
    };
  }, [scene, shapeName, dataBlock, dataBlockId, jiggle, engineStore]);
  return (time: number, resetKey: number) => update.current?.(time, resetKey);
}
