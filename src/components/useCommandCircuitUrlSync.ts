import { useEffect } from "react";
import { commandCircuitStore } from "../state/commandCircuitStore";
import {
  gameEntityStore,
  useDataSource,
  useMissionName,
} from "../state/gameEntityStore";
import {
  liveConnectionStore,
  useLiveSelector,
} from "../state/liveConnectionStore";
import {
  navigationMode,
  navigationViewKey,
  useMissionQueryState,
  useNavigationQueryState,
  type NavigationQuery,
} from "./useQueryParams";

/** Restore first, then mirror actual transitions rather than render snapshots. */
export function syncCommandCircuitView(
  view: "cc" | null,
  ready: boolean,
  key: string,
  updateQuery: (
    update: (current: NavigationQuery) => Partial<NavigationQuery>,
  ) => void,
) {
  const state = commandCircuitStore.getState();
  if (view === "cc") {
    if (!ready) return;
    if (!state.active) state.activate();
  } else if (state.active) {
    state.deactivate();
  }
  let mirroredKey = key;
  let pending = false;
  let stopped = false;
  const unsubscribe = commandCircuitStore.subscribe((state, previous) => {
    if (state.active === previous.active || pending) return;
    pending = true;
    // nuqs batches writes: publish the final state of a synchronous burst,
    // rather than comparing each transition against its uncommitted echo.
    queueMicrotask(() => {
      pending = false;
      if (stopped) return;
      const nextView = commandCircuitStore.getState().active ? "cc" : null;
      updateQuery((current) => {
        if (
          navigationViewKey(current) !== mirroredKey ||
          current.view === nextView
        )
          return {};
        mirroredKey = navigationViewKey({ ...current, view: nextView });
        return { view: nextView };
      });
    });
  });
  return () => {
    stopped = true;
    unsubscribe();
  };
}

export function useCommandCircuitUrlSync() {
  const [query, setQuery] = useNavigationQueryState();
  const [mission] = useMissionQueryState();
  const mode = navigationMode(query);
  const view = query.view;
  const key = navigationViewKey(query);
  const dataSource = useDataSource();
  const loadedMission = useMissionName();
  const liveReady = useLiveSelector((s) => s.liveReady);

  useEffect(() => {
    // Earlier navigation effects may already have unloaded the old scene.
    const scene = gameEntityStore.getState();
    const ready =
      scene.dataSource === mode &&
      (mode !== "live" || liveConnectionStore.getState().liveReady) &&
      (mode !== "map" ||
        scene.missionName?.toLowerCase() === mission.missionName.toLowerCase());
    return syncCommandCircuitView(view, ready, key, setQuery);
  }, [
    view,
    key,
    mode,
    mission.missionName,
    dataSource,
    loadedMission,
    liveReady,
    setQuery,
  ]);
}
