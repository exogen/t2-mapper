import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { StatsData, StatsTeamFilter } from "../stats/types";

export interface StatsState {
  data: StatsData | null;
  heatmapVisible: boolean;
  heatmapTeamFilter: StatsTeamFilter;
  /**
   * User-facing load error, shown in the stats panel.
   */
  error: string | null;
  /**
   * Mission-anchor mismatch note, shown in the stats panel.
   */
  anchorWarning: string | null;
  /**
   * One-shot request to enter command circuit once the data's mission is
   * loaded (resolved by an effect in MapInspector).
   */
  pendingCommandCircuit: boolean;
  setData(data: StatsData | null): void;
  setHeatmapVisible(heatmapVisible: boolean): void;
  setHeatmapTeamFilter(filter: StatsTeamFilter): void;
  setError(error: string | null): void;
  setAnchorWarning(warning: string | null): void;
  clearPendingCommandCircuit(): void;
  clear(): void;
}

export const statsStore = createStore<StatsState>((set) => ({
  data: null,
  heatmapVisible: true,
  heatmapTeamFilter: "all",
  error: null,
  anchorWarning: null,
  pendingCommandCircuit: false,
  setData(data) {
    set({
      data,
      heatmapVisible: true,
      heatmapTeamFilter: "all",
      error: null,
      anchorWarning: null,
      pendingCommandCircuit: data !== null,
    });
  },
  setHeatmapVisible(heatmapVisible) {
    set({ heatmapVisible });
  },
  setHeatmapTeamFilter(heatmapTeamFilter) {
    set({ heatmapTeamFilter });
  },
  setError(error) {
    set({ error });
  },
  setAnchorWarning(anchorWarning) {
    set({ anchorWarning });
  },
  clearPendingCommandCircuit() {
    set({ pendingCommandCircuit: false });
  },
  clear() {
    set({
      data: null,
      heatmapVisible: true,
      heatmapTeamFilter: "all",
      error: null,
      anchorWarning: null,
      pendingCommandCircuit: false,
    });
  },
}));

export function useStats<T>(
  selector: (state: StatsState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(statsStore, selector, equality);
}
