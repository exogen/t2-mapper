import { useCallback, type ChangeEvent } from "react";
import {
  useDemoActions,
  useDemoCurrentTime,
  useDemoDuration,
  useDemoIsPlaying,
  useDemoRecording,
  useDemoSpeed,
} from "./DemoProvider";
import {
  buildSerializableDiagnosticsJson,
  buildSerializableDiagnosticsSnapshot,
  useEngineSelector,
  useEngineStoreApi,
} from "../state";
import styles from "./DemoControls.module.css";

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(value: number | undefined): string {
  if (!Number.isFinite(value) || value == null) {
    return "n/a";
  }
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

export function DemoControls() {
  const recording = useDemoRecording();
  const isPlaying = useDemoIsPlaying();
  const currentTime = useDemoCurrentTime();
  const duration = useDemoDuration();
  const speed = useDemoSpeed();
  const { play, pause, seek, setSpeed } = useDemoActions();
  const engineStore = useEngineStoreApi();
  const webglContextLost = useEngineSelector(
    (state) => state.diagnostics.webglContextLost,
  );
  const rendererSampleCount = useEngineSelector(
    (state) => state.diagnostics.rendererSamples.length,
  );
  const latestRendererSample = useEngineSelector((state) => {
    const samples = state.diagnostics.rendererSamples;
    return samples.length > 0 ? samples[samples.length - 1] : null;
  });
  const playbackEventCount = useEngineSelector(
    (state) => state.diagnostics.playbackEvents.length,
  );
  const latestPlaybackEvent = useEngineSelector((state) => {
    const events = state.diagnostics.playbackEvents;
    return events.length > 0 ? events[events.length - 1] : null;
  });

  const handleSeek = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      seek(parseFloat(e.target.value));
    },
    [seek],
  );

  const handleSpeedChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      setSpeed(parseFloat(e.target.value));
    },
    [setSpeed],
  );

  const handleDumpDiagnostics = useCallback(() => {
    const state = engineStore.getState();
    const snapshot = buildSerializableDiagnosticsSnapshot(state);
    const json = buildSerializableDiagnosticsJson(state);
    console.log("[demo diagnostics dump]", snapshot);
    console.log("[demo diagnostics dump json]", json);
  }, [engineStore]);

  const handleClearDiagnostics = useCallback(() => {
    engineStore.getState().clearPlaybackDiagnostics();
    console.info("[demo diagnostics] Cleared playback diagnostics");
  }, [engineStore]);

  if (!recording) return null;

  return (
    <div
      className={styles.Root}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className={styles.PlayPause}
        onClick={isPlaying ? pause : play}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "\u275A\u275A" : "\u25B6"}
      </button>
      <span className={styles.Time}>
        {`${formatTime(currentTime)} / ${formatTime(duration)}`}
      </span>
      <input
        className={styles.Seek}
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={currentTime}
        onChange={handleSeek}
      />
      <select
        className={styles.Speed}
        value={speed}
        onChange={handleSpeedChange}
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>
      <div
        className={styles.DiagnosticsPanel}
        data-context-lost={webglContextLost ? "true" : undefined}
      >
        <div className={styles.DiagnosticsStatus}>
          {webglContextLost ? "WebGL context: LOST" : "WebGL context: ok"}
        </div>
        <div className={styles.DiagnosticsMetrics}>
          {latestRendererSample ? (
            <>
              <span>
                geom {latestRendererSample.geometries} tex{" "}
                {latestRendererSample.textures} prog{" "}
                {latestRendererSample.programs}
              </span>
              <span>
                draw {latestRendererSample.renderCalls} tri{" "}
                {latestRendererSample.renderTriangles}
              </span>
              <span>
                scene {latestRendererSample.visibleSceneObjects}/
                {latestRendererSample.sceneObjects}
              </span>
              <span>heap {formatBytes(latestRendererSample.jsHeapUsed)}</span>
            </>
          ) : (
            <span>No renderer samples yet</span>
          )}
        </div>
        <div className={styles.DiagnosticsFooter}>
          <span>
            samples {rendererSampleCount} events {playbackEventCount}
          </span>
          {latestPlaybackEvent ? (
            <span title={latestPlaybackEvent.message}>
              last event: {latestPlaybackEvent.kind}
            </span>
          ) : (
            <span>last event: none</span>
          )}
          <button type="button" onClick={handleDumpDiagnostics}>
            Dump
          </button>
          <button type="button" onClick={handleClearDiagnostics}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
