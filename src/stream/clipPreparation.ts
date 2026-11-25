import type { ClipView } from "../../relay/clipTypes";
import { demoLoadStore } from "../state/demoLoadStore";
import { engineStore } from "../state/engineStore";
import { publishedDemoFilename } from "../state/editableGame";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { readClip } from "./clipApi";
import { readClipCheckpoint, recoverClipCheckpoint } from "./clipCheckpointApi";
import { startClipPlayback } from "./clipPlayback";
import { getDemoLoadGeneration, loadDemoReference } from "./demoFileLoader";
import type { StreamRecording } from "./types";

class ClipSourceError extends Error {
  constructor(
    message = "The source demo download was interrupted. Please retry the download.",
  ) {
    super(message);
  }
}

/** Wait for finalized bytes and the scene binding, in either store order. */
function waitForClipSource(clip: ClipView, signal: AbortSignal) {
  return new Promise<{
    recording: StreamRecording;
    buffer: ArrayBuffer;
    interrupted: boolean;
    loadGeneration: number;
  }>((resolve, reject) => {
    const cleanups: Array<() => void> = [];
    const finish = (error?: unknown) => {
      cleanups.splice(0).forEach((cleanup) => cleanup());
      signal.removeEventListener("abort", aborted);
      if (error) reject(error);
    };
    const aborted = () => finish(signal.reason);
    const inspect = () => {
      if (signal.aborted) return aborted();
      const load = demoLoadStore.getState();
      // Child effects can run before navigation starts this demo's download.
      // Earlier requests (including their errors) do not belong to this clip.
      if (
        load.requestedDemo !== clip.sourceDemo &&
        publishedDemoFilename(load.requestedUrl) !== clip.sourceDemo
      )
        return;
      const playback = engineStore.getState().playback;
      const recording = playback.recording;
      if (
        recording &&
        playback.demoBuffer &&
        playback.downloadStatus !== "downloading" &&
        publishedDemoFilename(load.sourceUrl) === clip.sourceDemo &&
        streamPlaybackStore.getState().playback === recording.streamingPlayback
      ) {
        finish();
        resolve({
          recording,
          buffer: playback.demoBuffer,
          interrupted: playback.downloadStatus === "interrupted",
          loadGeneration: getDemoLoadGeneration(),
        });
      } else if (load.phase === "error") {
        finish(new ClipSourceError());
      }
    };
    cleanups.push(
      engineStore.subscribe(inspect),
      demoLoadStore.subscribe(inspect),
      streamPlaybackStore.subscribe(inspect),
    );
    signal.addEventListener("abort", aborted, { once: true });
    inspect();
  });
}

type ClipSource = Awaited<ReturnType<typeof waitForClipSource>>;

function ensureCurrent(
  clip: ClipView,
  source: ClipSource,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const playback = engineStore.getState().playback;
  if (
    playback.recording !== source.recording ||
    playback.demoBuffer !== source.buffer ||
    getDemoLoadGeneration() !== source.loadGeneration ||
    publishedDemoFilename(demoLoadStore.getState().sourceUrl) !==
      clip.sourceDemo
  )
    throw new DOMException("Clip preparation was interrupted", "AbortError");
}

function verifySource(clip: ClipView, source: ClipSource, signal: AbortSignal) {
  ensureCurrent(clip, source, signal);
  if (source.interrupted) throw new ClipSourceError();
  if (
    clip.sourceBytes !== undefined &&
    source.buffer.byteLength !== clip.sourceBytes
  )
    throw new ClipSourceError(
      "The downloaded recording has an unexpected size. Please retry the download.",
    );
}

/** One attempt owns at most one replacement source download. */
async function loadClipSource(clip: ClipView, signal: AbortSignal) {
  let source: ClipSource | undefined;
  try {
    source = await waitForClipSource(clip, signal);
    verifySource(clip, source, signal);
  } catch (error) {
    signal.throwIfAborted();
    if (source) ensureCurrent(clip, source, signal);
    if (!(error instanceof ClipSourceError)) throw error;
    const expectedRecording = engineStore.getState().playback.recording;
    const expectedGeneration = getDemoLoadGeneration();
    const fresh = await readClip(clip.id, signal);
    signal.throwIfAborted();
    if (source) ensureCurrent(clip, source, signal);
    if (
      fresh.id !== clip.id ||
      fresh.sourceDemo !== clip.sourceDemo ||
      fresh.state !== "ready" ||
      !fresh.timeline
    )
      throw new Error("Could not prepare the clip. Please try again.");
    clip = fresh;
    await loadDemoReference(clip.sourceDemo, {
      cache: "no-store",
      signal,
      expectedRecording,
      expectedGeneration,
    });
    signal.throwIfAborted();
    if (engineStore.getState().playback.recording === expectedRecording)
      throw new Error(
        demoLoadStore.getState().error ??
          "Could not download the source demo. Please retry.",
      );
    source = await waitForClipSource(clip, signal);
    verifySource(clip, source, signal);
  }
  return { clip, source };
}

/** Track user intent continuously, including the interval between replacement
 * installation and EOF. Recording installation itself resets the seek nonce;
 * only a seek on the same recording interrupts preparation. */
export async function prepareClipPlayback(
  clip: ClipView,
  signal: AbortSignal,
): Promise<StreamRecording> {
  const canceled = new AbortController();
  const preparing = AbortSignal.any([signal, canceled.signal]);
  const stop = engineStore.subscribe((next, previous) => {
    if (
      next.playback.recording &&
      next.playback.recording === previous.playback.recording &&
      next.playback.seekIntentNonce !== previous.playback.seekIntentNonce
    )
      canceled.abort(
        new DOMException("Clip preparation was interrupted", "AbortError"),
      );
  });
  let ready;
  let checkpoint;
  try {
    ready = await loadClipSource(clip, preparing);
    checkpoint = await readClipCheckpoint(ready.clip, preparing);
    ensureCurrent(ready.clip, ready.source, preparing);
  } finally {
    stop();
  }
  const { clip: selected, source } = ready;
  if (!selected.timeline) throw new Error("The clip has no camera recording.");
  // startClipPlayback owns subsequent seek-intent checks, including its own seek.
  await startClipPlayback(
    selected.timeline,
    source.recording,
    signal,
    checkpoint
      ? {
          text: checkpoint.text,
          sourceSha256: selected.sourceSha256,
          recover: () =>
            recoverClipCheckpoint(selected, checkpoint.etag, signal),
        }
      : undefined,
  );
  signal.throwIfAborted();
  return source.recording;
}
