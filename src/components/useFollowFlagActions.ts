import { useInputAction } from "./InputControls";
import { followFlag } from "../state/watchFollow";

/**
 * Wire the number-key flag-follow actions (see FLAG_FOLLOW_INPUT) to
 * `followFlag`, gated by `isActive` — shared by the demo and watch
 * camera controllers.
 */
export function useFollowFlagActions(isActive: () => boolean): void {
  const act = (slot: number) => () => {
    if (isActive()) followFlag(slot);
  };
  useInputAction("followFlag1", act(1));
  useInputAction("followFlag2", act(2));
  useInputAction("followFlag3", act(3));
  useInputAction("followFlag4", act(4));
  useInputAction("followFlag5", act(5));
  useInputAction("followFlag6", act(6));
  useInputAction("followFlag7", act(7));
  useInputAction("followFlag8", act(8));
  useInputAction("followFlag9", act(9));
}
