import type { DataSource } from "../state/gameEntityStore";
import type { AppMode } from "./useQueryParams";

export function modeFeatureAccess(
  mode: AppMode,
  dataSource: DataSource | null,
) {
  // Keep restrictions active while navigation is retiring an old stream.
  const isLive = mode === "live" || dataSource === "live";
  const isDemo = mode === "demo" || dataSource === "demo";
  const isMap = !isLive && !isDemo;
  const isNonProduction = process.env.NODE_ENV !== "production";
  return {
    canShowDebugVisuals: isNonProduction || isMap,
    canDisableFog: isNonProduction || !isLive,
    canShowEntityList: isNonProduction || isMap,
  };
}
