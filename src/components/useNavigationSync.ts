import { useEffect, useRef } from "react";
import { demoLoadStore } from "../state/demoLoadStore";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { loadDemoUrl, unloadDemo } from "../stream/demoFileLoader";
import { DEMOS_BASE_URL, demoDownloadUrl } from "../stream/demoIndex";
import {
  navigationMode,
  normalizeNavigationQuery,
  useNavigationQueryState,
} from "./useQueryParams";

/** Always mounted: hidden Activity pickers must never own route side effects. */
export function useNavigationSync() {
  const [query, setQuery] = useNavigationQueryState();
  const mode = navigationMode(query);
  const previousDemo = useRef<string | null>(null);

  useEffect(() => {
    if (Object.keys(normalizeNavigationQuery(query)).length > 0)
      void setQuery(normalizeNavigationQuery);
  }, [query, setQuery]);

  useEffect(() => {
    const live = liveConnectionStore.getState();
    if (mode !== "live" && (live.role || live._relay)) {
      live.leaveServer();
      live.disconnectRelay();
    }
    const load = demoLoadStore.getState();
    const recording = engineStore.getState().playback.recording;
    if (
      (mode !== "demo" &&
        (load.requestedUrl ||
          load.phase !== "idle" ||
          recording?.source === "demo")) ||
      (mode !== "live" && gameEntityStore.getState().dataSource === "live")
    )
      unloadDemo();
  }, [mode]);

  useEffect(() => {
    const demo = mode === "demo" ? query.demo : null;
    const previous = previousDemo.current;
    previousDemo.current = demo;
    if (!demo) {
      // Browser history can remove ?demo without an explicit eject action.
      if (
        previous &&
        demoLoadStore.getState().requestedUrl === demoDownloadUrl(previous)
      )
        unloadDemo();
      return;
    }
    const url = demoDownloadUrl(demo);
    if (!DEMOS_BASE_URL || demoLoadStore.getState().requestedUrl === url)
      return;
    unloadDemo();
    void loadDemoUrl(url);
  }, [mode, query.demo]);
}
