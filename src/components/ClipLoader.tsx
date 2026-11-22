import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { clipStore } from "../state/clipStore";
import { useDemoLoad } from "../state/demoLoadStore";
import { useEngineSelector, engineStore } from "../state/engineStore";
import { publishedDemoFilename } from "../state/editableGame";
import { graphicsEffectsStore } from "../state/graphicsEffectsStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  ClipApiError,
  readClipCheckpoint,
  recoverClipCheckpoint,
} from "../stream/clipApi";
import { startClipPlayback } from "../stream/clipPlayback";
import { navigationMode, useNavigationQueryState } from "./useQueryParams";
import { useAppNavigation } from "./useAppNavigation";
import { useClipQuery } from "./useClipQuery";
import { PlaybackNotice } from "./PlaybackNotice";
import styles from "./ClipControls.module.css";

/** A clip owns the initial seek; ordinary moment links must wait outside this path. */
export function ClipLoader() {
  const { exitClip } = useAppNavigation();
  const [route, setRoute] = useNavigationQueryState();
  const id = navigationMode(route) === "demo" ? route.clip : null;
  const clipEffects = useStore(clipStore, (state) =>
    state.playheadMs === 0 ? state.playbackEffects : null,
  );
  const applyingEffects = useStore(
    clipEffects ?? graphicsEffectsStore,
    (effects) => effects.awaitingFirstFrame,
  );
  const recording = useEngineSelector((state) => state.playback.recording);
  const buffer = useEngineSelector((state) => state.playback.demoBuffer);
  const complete = useEngineSelector(
    (state) => state.playback.downloadComplete,
  );
  const source = publishedDemoFilename(useDemoLoad((state) => state.sourceUrl));
  const attached = useStore(
    streamPlaybackStore,
    (state) => !!recording && state.playback === recording.streamingPlayback,
  );
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [prepared, setPrepared] = useState<{
    id: string;
    recording: typeof recording;
  } | null>(null);
  const clip = useClipQuery(id);
  const view = clip.data;
  const refetch = clip.refetch;

  useEffect(() => {
    setPrepared(null);
    setError(null);
    clipStore.getState().stopPlayback();
    return () => clipStore.getState().stopPlayback();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return clipStore.subscribe((state, previous) => {
      if (
        previous.active &&
        !state.active &&
        engineStore.getState().playback.status === "seeking"
      )
        void setRoute((current) =>
          current.clip === id ? { clip: null, t: null } : {},
        );
    });
  }, [id, setRoute]);

  useEffect(() => {
    if (!id || !view || view.id !== id) return;
    if (route.demo !== view.sourceDemo)
      void setRoute((current) =>
        current.clip === id
          ? {
              mode: "demo",
              demo: view.sourceDemo,
              user: null,
              t: null,
              view: null,
            }
          : {},
      );
  }, [id, view, route.demo, setRoute]);

  useEffect(() => {
    if (
      id &&
      view &&
      source === view.sourceDemo &&
      recording &&
      attached &&
      prepared?.recording !== recording &&
      engineStore.getState().playback.status !== "seeking"
    )
      engineStore.getState().setPlaybackStatus("paused");
  }, [id, view, source, recording, attached, prepared]);

  useEffect(() => {
    if (
      !id ||
      !view ||
      view.id !== id ||
      view.state !== "ready" ||
      !view.timeline ||
      !recording ||
      !complete ||
      !buffer ||
      !attached ||
      source !== view.sourceDemo ||
      (prepared?.id === id && prepared.recording === recording)
    )
      return;
    const abort = new AbortController();
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(60_000)]);
    setPreparing(true);
    setError(null);
    void (async () => {
      try {
        const checkpoint = await readClipCheckpoint(view, signal);
        signal.throwIfAborted();
        await startClipPlayback(
          view.timeline!,
          recording,
          signal,
          checkpoint.text,
          (error) =>
            recoverClipCheckpoint(view, buffer, checkpoint.etag, signal, error),
        );
        setPrepared({ id, recording });
      } catch (cause) {
        if (
          !abort.signal.aborted &&
          cause instanceof ClipApiError &&
          cause.status === 409
        ) {
          await refetch();
          if (!abort.signal.aborted) setRetry((value) => value + 1);
          return;
        }
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not prepare the clip.",
          );
      } finally {
        if (!abort.signal.aborted) setPreparing(false);
      }
    })();
    return () => abort.abort();
  }, [
    id,
    view,
    recording,
    complete,
    buffer,
    attached,
    source,
    retry,
    prepared,
    refetch,
  ]);

  if (!id) return null;
  const failed =
    error ??
    (clip.error instanceof Error ? clip.error.message : null) ??
    (view?.state === "failed"
      ? (view.error ?? "The clip could not be prepared.")
      : null);
  const message = failed
    ? failed
    : !view
      ? "Loading clip…"
      : view.state === "processing"
        ? "Preparing the clip’s starting checkpoint…"
        : !complete || source !== view.sourceDemo
          ? "Loading the source demo…"
          : preparing || prepared?.id !== id || prepared.recording !== recording
            ? "Restoring the clip’s starting view…"
            : applyingEffects
              ? "Applying the clip’s graphics effects…"
              : "";
  if (!message) return null;
  return (
    <PlaybackNotice failed={!!failed}>
      <span>{message}</span>
      {failed && (
        <>
          {view?.state !== "failed" &&
            !(
              clip.error instanceof ClipApiError &&
              [400, 404, 410].includes(clip.error.status)
            ) && (
              <button
                type="button"
                className={styles.UtilityButton}
                onClick={() => {
                  setError(null);
                  setRetry((value) => value + 1);
                  void clip.refetch();
                }}
              >
                Retry
              </button>
            )}
          <button
            type="button"
            className={styles.ExitButton}
            onClick={exitClip}
          >
            Exit clip
          </button>
        </>
      )}
    </PlaybackNotice>
  );
}
