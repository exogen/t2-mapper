import type { DataSource } from "../state/gameEntityStore";
import { cameraTourStore } from "../state/cameraTourStore";
import { settingsStore, type FeatureAccess } from "../state/settingsStore";
import type { AppMode } from "./useQueryParams";

export function modeFeatureAccess(
  mode: AppMode,
  dataSource: DataSource | null,
): FeatureAccess {
  // Keep restrictions active while navigation is retiring an old stream.
  const isLive = mode === "live" || mode === "replay" || dataSource === "live";
  const isDemo = mode === "demo" || dataSource === "demo";
  const isMap = !isLive && !isDemo;
  const isNonProduction = process.env.NODE_ENV !== "production";
  return {
    canShowDebugVisuals: isNonProduction || isMap,
    canDisableFog: isNonProduction || !isLive,
    canShowEntityList: isNonProduction || isMap,
  };
}

/**
 * Apply the mode's restrictions and the URL's fog override to the settings
 * store. A debug (entity list) tour can't continue where the entity list
 * isn't allowed.
 */
export function applyModeFeatureAccess(
  mode: AppMode,
  dataSource: DataSource | null,
  fogEnabledOverride: boolean | null,
  store = settingsStore,
): void {
  const access = modeFeatureAccess(mode, dataSource);
  const current = store.getState();
  if (
    current.fogEnabledOverride !== fogEnabledOverride ||
    current.access.canDisableFog !== access.canDisableFog ||
    current.access.canShowDebugVisuals !== access.canShowDebugVisuals ||
    current.access.canShowEntityList !== access.canShowEntityList
  )
    store.setState({ access, fogEnabledOverride });
  if (!access.canShowEntityList) {
    const tour = cameraTourStore.getState();
    if (tour.animation?.tourType === "debug") tour.cancel();
  }
}
