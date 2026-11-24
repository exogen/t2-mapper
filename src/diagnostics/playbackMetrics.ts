import { demoLoadStore } from "../state/demoLoadStore";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { settingsStore } from "../state/settingsStore";
import { streamClock } from "../state/streamPlaybackStore";
import { graphicsEffectsStore } from "../state/graphicsEffectsStore";
import {
  markDiagnosticEvent,
  setDiagnosticsContext,
} from "./browserDiagnostics";
import { registerMetricSource } from "./resourceMetricRegistry";

/** Scalar probes only: never build a snapshot or serialize a simulation graph. */
export function installPlaybackMetrics(): () => void {
  const stopMetrics = registerMetricSource("playback", () => {
    const playback = engineStore.getState().playback;
    const game = gameEntityStore.getState();
    const settings = settingsStore.getState();
    // Sampling also initializes context for a recording started from the
    // debug panel after the mission has already loaded.
    setDiagnosticsContext({
      source: game.dataSource,
      mission: game.missionName,
      playbackStatus: playback.status,
      liveWatchStatus: liveConnectionStore.getState().watchStatus,
    });
    return {
      demoCompressedBytes: playback.demoBuffer?.byteLength ?? 0,
      ...playback.recording?.streamingPlayback.getDiagnosticMetrics?.(),
      ...liveConnectionStore.getState()._relay?.getDiagnosticMetrics(),
      playheadSec: streamClock.time,
      downloadedSec: demoLoadStore.getState().downloadedSec,
      seeking: playback.status === "seeking" ? 1 : 0,
      downloadComplete: playback.downloadStatus === "complete" ? 1 : 0,
      rate: playback.rate,
      missionEntities: game.missionEntities.size,
      streamEntities: game.streamEntities.size,
      renderScale: settings.renderScale,
      fpsLimit: settings.fpsLimit,
      renderOnDemand: settings.renderOnDemand ? 1 : 0,
      projectedShadows: settings.shadowsEnabled ? 1 : 0,
      audioEnabled: settings.audioEnabled ? 1 : 0,
      postProcessingEnabled: graphicsEffectsStore.getState().enabled ? 1 : 0,
    };
  });
  const stopLoad = demoLoadStore.subscribe((state, previous) => {
    if (state.phase !== previous.phase)
      markDiagnosticEvent(`demo-load-${state.phase}`);
  });
  const stopPlayback = engineStore.subscribe((state, previous) => {
    const next = state.playback;
    const before = previous.playback;
    if (next.recording !== before.recording)
      markDiagnosticEvent("recording-replaced", {
        source: next.recording?.source ?? null,
      });
    if (next.seekNonce !== before.seekNonce)
      markDiagnosticEvent("seek-start", {
        targetSec: next.seekTime,
        nonce: next.seekNonce,
      });
    if (before.status === "seeking" && next.status !== "seeking")
      markDiagnosticEvent("seek-end", {
        failed: next.seekFailed,
        nonce: next.seekNonce,
      });
    if (next.status !== before.status)
      markDiagnosticEvent(`playback-${next.status}`);
    if (next.downloadStatus !== before.downloadStatus)
      markDiagnosticEvent(`demo-download-${next.downloadStatus}`);
  });
  const stopGame = gameEntityStore.subscribe((state, previous) => {
    if (
      state.dataSource !== previous.dataSource ||
      state.missionName !== previous.missionName
    ) {
      setDiagnosticsContext({
        source: state.dataSource,
        mission: state.missionName,
      });
      markDiagnosticEvent("mission-changed", {
        source: state.dataSource,
        mission: state.missionName,
      });
    }
  });
  const stopLive = liveConnectionStore.subscribe((state, previous) => {
    if (state.watchStatus !== previous.watchStatus)
      markDiagnosticEvent("live-watch-status", { status: state.watchStatus });
    if (state.gameStatus !== previous.gameStatus)
      markDiagnosticEvent("live-connection-status", {
        status: state.gameStatus,
      });
    if (state.reconnecting !== previous.reconnecting)
      markDiagnosticEvent("live-reconnecting", { active: state.reconnecting });
    if (state.liveReady && !previous.liveReady)
      markDiagnosticEvent("live-scene-ready");
  });
  return () => {
    stopMetrics();
    stopLoad();
    stopPlayback();
    stopGame();
    stopLive();
  };
}
