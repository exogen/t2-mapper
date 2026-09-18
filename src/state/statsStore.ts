import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { MatchStats, StatsData } from "../stats/types";
import type { HeatmapScheme } from "../stats/colormap";
import { engineStore } from "./engineStore";
import type { StreamRecording } from "../stream/types";
import { streamSnapshotStore } from "./streamSnapshotStore";

export interface StatsState {
  data: StatsData | null;
  activeMatch: MatchStats | null;
  /** Hide the overlay while the viewer still has the previous game's scene. */
  sceneReady: boolean;
  scanProgress: number | null;
  /** Null disables the heatmap. */
  selectedPlayerId: number | null;
  heatmapScheme: HeatmapScheme;
  error: string | null;
  selectPlayer(id: number | null): void;
  setHeatmapScheme(scheme: HeatmapScheme): void;
}

const emptyStats = {
  data: null,
  activeMatch: null,
  sceneReady: false,
  scanProgress: null,
  selectedPlayerId: null,
  error: null,
};

export const statsStore = createStore<StatsState>((set) => ({
  ...emptyStats,
  heatmapScheme: "turbo",
  selectPlayer(selectedPlayerId) {
    set({ selectedPlayerId });
  },
  setHeatmapScheme(heatmapScheme) {
    set({ heatmapScheme });
  },
}));

let enabled = false;
let demoBuffer: ArrayBuffer | null = null;
let recording: StreamRecording | null = null;
let scanAbort: AbortController | null = null;
let unsubscribe: (() => void) | null = null;
let unsubscribeSnapshot: (() => void) | null = null;

/** Only the feature-gated UI enables this; ordinary demo loads do no stats work. */
export function setStatsEnabled(value: boolean): void {
  enabled = value;
  if (value) {
    unsubscribe ??= engineStore.subscribe((state, previous) => {
      if (
        state.playback.recording !== previous.playback.recording ||
        state.playback.demoBuffer !== previous.playback.demoBuffer ||
        state.playback.downloadComplete !== previous.playback.downloadComplete
      )
        syncRecording();
      else if (
        state.playback.seekNonce !== previous.playback.seekNonce &&
        !streamSnapshotStore.getState().snapshot
      )
        syncActiveMatch();
    });
    unsubscribeSnapshot ??= streamSnapshotStore.subscribe(() =>
      syncActiveMatch(),
    );
    // A remount / hot reload may have missed the original load notification.
    syncRecording();
  } else {
    unsubscribe?.();
    unsubscribe = null;
    unsubscribeSnapshot?.();
    unsubscribeSnapshot = null;
    resetStats();
  }
}

function syncRecording(): void {
  const playback = engineStore.getState().playback;
  const nextRecording =
    playback.recording?.source === "demo" ? playback.recording : null;
  const nextBuffer = nextRecording ? playback.demoBuffer : null;
  if (recording !== nextRecording || demoBuffer !== nextBuffer) {
    resetStats();
    recording = nextRecording;
    demoBuffer = nextBuffer;
  }
  if (recording && !demoBuffer && playback.downloadComplete) {
    statsStore.setState({
      error:
        "Demo source data is unavailable. Reload the demo to scan its stats.",
    });
    return;
  }
  startScan();
}

function syncActiveMatch(): void {
  const state = statsStore.getState();
  const snapshot = streamSnapshotStore.getState().snapshot;
  const timeSec = snapshot?.timeSec ?? engineStore.getState().playback.seekTime;
  const activeMatch =
    state.data?.matches.findLast((match) => match.fromSec <= timeSec) ?? null;
  const sceneReady =
    snapshot != null &&
    activeMatch?.sceneFromSec != null &&
    timeSec >= activeMatch.sceneFromSec &&
    !(
      snapshot.matchEnded &&
      (snapshot.matchEndedAtSec ?? timeSec) <= activeMatch.fromSec
    );
  if (activeMatch === state.activeMatch) {
    if (sceneReady !== state.sceneReady) statsStore.setState({ sceneReady });
    return;
  }
  // IDs are local to each match. Keep the chosen base name when available,
  // never accidentally select a different player who has the same numeric ID.
  const name = state.activeMatch?.players
    .find((player) => player.id === state.selectedPlayerId)
    ?.name.toLowerCase();
  const selectedPlayerId = name
    ? (activeMatch?.players.find((player) => player.name.toLowerCase() === name)
        ?.id ?? null)
    : null;
  statsStore.setState({ activeMatch, selectedPlayerId, sceneReady });
}

/** Cancel work belonging to the previous source, without discarding playback's bytes. */
function resetStats(): void {
  scanAbort?.abort();
  scanAbort = null;
  demoBuffer = null;
  recording = null;
  statsStore.setState(emptyStats);
}

function startScan(): void {
  if (
    !enabled ||
    !demoBuffer ||
    scanAbort ||
    statsStore.getState().data ||
    statsStore.getState().error
  )
    return;
  const buffer = demoBuffer;
  const abort = new AbortController();
  scanAbort = abort;
  statsStore.setState({ scanProgress: 0, error: null });
  void import("../stats/demoStatsScanner")
    .then(({ scanDemoStats }) =>
      scanDemoStats(
        buffer,
        (scanProgress) => {
          if (!abort.signal.aborted) statsStore.setState({ scanProgress });
        },
        abort.signal,
      ),
    )
    .then((data) => {
      if (!abort.signal.aborted) {
        statsStore.setState({ data, scanProgress: null });
        syncActiveMatch();
      }
    })
    .catch((error: unknown) => {
      if (abort.signal.aborted) return;
      statsStore.setState({
        scanProgress: null,
        error:
          error instanceof Error ? error.message : "Couldn't scan this demo.",
      });
    })
    .finally(() => {
      if (scanAbort === abort) scanAbort = null;
    });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => setStatsEnabled(false));
}

export function useStats<T>(
  selector: (state: StatsState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(statsStore, selector, equality);
}
