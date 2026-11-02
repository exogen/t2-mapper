import { useEffect, useRef } from "react";
import { demoLoadStore } from "../state/demoLoadStore";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import {
  replayConnectionStore,
  useReplaySelector,
} from "../state/replayConnectionStore";
import { loadDemoReference, unloadDemo } from "../stream/demoFileLoader";
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
  const previousReplay = useRef<string | null>(null);
  const replaySessionId = useReplaySelector((state) => state.sessionId);

  useEffect(() => {
    if (Object.keys(normalizeNavigationQuery(query)).length > 0)
      void setQuery(normalizeNavigationQuery);
  }, [query, setQuery]);

  useEffect(() => {
    const live = liveConnectionStore.getState();
    if (mode !== "replay") replayConnectionStore.getState().leave();
    if (mode !== "live" && (live.role || live._relay)) {
      live.leaveServer();
      live.disconnectRelay();
    }
    const load = demoLoadStore.getState();
    const recording = engineStore.getState().playback.recording;
    if (
      (mode !== "demo" &&
        (load.requestedDemo ||
          load.requestedUrl ||
          load.phase !== "idle" ||
          recording?.source === "demo")) ||
      (mode !== "live" &&
        mode !== "replay" &&
        gameEntityStore.getState().dataSource === "live")
    )
      unloadDemo();
  }, [mode]);

  useEffect(() => {
    const demo = mode === "demo" ? query.demo : null;
    const previous = previousDemo.current;
    previousDemo.current = demo;
    if (!demo) {
      // Browser history can remove ?demo without an explicit eject action.
      if (previous && demoLoadStore.getState().requestedDemo === previous)
        unloadDemo();
      return;
    }
    if (demoLoadStore.getState().requestedDemo === demo) return;
    unloadDemo();
    void loadDemoReference(demo);
  }, [mode, query.demo]);

  useEffect(() => {
    if (mode !== "replay") {
      previousReplay.current = null;
      return;
    }
    const previous = previousReplay.current;
    previousReplay.current = query.replay;
    const replay = replayConnectionStore.getState();
    if (query.replay) {
      if (replay.sessionId !== query.replay) replay.join(query.replay);
    } else if (previous && replay.sessionId === previous) {
      replay.leave();
    }
  }, [mode, query.replay]);

  useEffect(() => {
    if (
      mode === "replay" &&
      !query.replay &&
      replaySessionId &&
      replayConnectionStore.getState().sessionId === replaySessionId
    )
      void setQuery({ replay: replaySessionId });
  }, [mode, query.replay, replaySessionId, setQuery]);
}
