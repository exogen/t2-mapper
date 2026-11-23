import {
  classifyDevice,
  readDeviceSignals,
  type DeviceSignals,
} from "./deviceConstraints";
import { performanceTuning } from "./performanceTuning";

export const DEFAULT_WORLD_SHADOW_SIZE =
  performanceTuning.worldShadowSize.desktop;
export const CONSTRAINED_WORLD_SHADOW_SIZE =
  performanceTuning.worldShadowSize.constrained;
type WorldShadowSize =
  | 1024
  | 2048
  | 4096
  | typeof DEFAULT_WORLD_SHADOW_SIZE
  | typeof CONSTRAINED_WORLD_SHADOW_SIZE;

/** Resolve before creating the shadow target, so constrained devices never
 * allocate a larger default first. Explicit comparison URLs take precedence. */
export function selectWorldShadowSize(
  search: string,
  signals: DeviceSignals = readDeviceSignals(),
): {
  size: WorldShadowSize;
  source: "override" | "device-default";
  constrained: boolean;
} {
  const { constrained } = classifyDevice(signals);
  const value = new URLSearchParams(search).get("worldShadowSize");
  if (value === "1024" || value === "2048" || value === "4096")
    return {
      size: Number(value) as WorldShadowSize,
      source: "override",
      constrained,
    };
  return {
    size: constrained
      ? CONSTRAINED_WORLD_SHADOW_SIZE
      : DEFAULT_WORLD_SHADOW_SIZE,
    source: "device-default",
    constrained,
  };
}

export function readWorldShadowSize(
  search: string,
  signals?: DeviceSignals,
): number {
  return selectWorldShadowSize(search, signals).size;
}
