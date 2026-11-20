import type { AnimationAction } from "three";
import {
  createDtsThread,
  dtsThreadPosition,
  scrubDtsThread,
} from "../dts/dtsThread";

const sequenceNames = ["light_recoil", "medium_recoil", "heavy_recoil"];

/** Player::onNewDataBlock (0x5d1080) leaves earlier threads paused at zero.
 * Player::onImageRecoil (0x5d6400) restarts the last available thread. */
export function createPlayerRecoil(
  findAction: (name: string) => AnimationAction | undefined,
  isCyclic: (action: AnimationAction) => boolean,
) {
  const threads = sequenceNames.flatMap((name) => {
    const action = findAction(name);
    return action ? [createDtsThread(action, isCyclic(action))] : [];
  });
  const active = threads.pop();
  if (!active) return;
  return (timeSec: number, startedAtSec?: number) => {
    for (const thread of threads) scrubDtsThread(thread, 0);
    const position =
      startedAtSec === undefined || startedAtSec > timeSec
        ? 0
        : dtsThreadPosition(active, timeSec - startedAtSec);
    scrubDtsThread(active, position);
  };
}

/** Use the latest recoil that has actually started in the rendered interval. */
export function playerRecoilStartAt(
  current: number | undefined,
  previous: number | undefined,
  timeSec: number,
): number | undefined {
  if (current === undefined || current <= timeSec) return current;
  if (previous !== undefined && previous <= timeSec) return previous;
}
