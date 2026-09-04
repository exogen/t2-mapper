/**
 * The demo harness for the director's match trackers: one background
 * pass over the demo with an independent headless StreamingPlayback,
 * pumping DirectorTrackers (the strictly-causal reducer that also
 * backs live casting) step by step. Events are parsed by the trackers
 * themselves from each snapshot's raw server-message feed — CastGenius
 * owns its own event scanning and needs nothing from the app's
 * timeline. Yields to the event loop to stay responsive; safe to run
 * while the same buffer plays back (separate parser, no shared state).
 */
import type { DirectorDataset } from "../director/types";
import { createDemoStreamingRecording } from "./demoStreaming";
import { DirectorTrackers, FLAG_STEP_SEC } from "./directorTrackers";

/** Yield to the event loop every N seconds of demo time. */
const YIELD_EVERY_SEC = 5;

/**
 * Walk a whole recording and hand back the finished dataset.
 *
 * A thin wrapper on the streaming scan, NOT a second implementation:
 * the two used to spell the same loop out separately, which is exactly
 * the drift the cast pipeline warns about elsewhere. Batch is just the
 * stream driven to the end.
 */
export async function scanDemoDirector(
  buffer: ArrayBuffer,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<DirectorDataset> {
  const stream = await createDirectorScanStream(buffer);
  const step = Math.max(YIELD_EVERY_SEC, stream.durationSec / 100);
  for (let t = 0; t < stream.durationSec; t += step) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await stream.advanceTo(Math.min(t + step, stream.durationSec));
    onProgress?.(Math.min(stream.scannedToSec / stream.durationSec, 1));
  }
  await stream.advanceTo(stream.durationSec);
  onProgress?.(1);
  return stream.datasetTo(stream.durationSec);
}

export interface DirectorScanStream {
  readonly durationSec: number;
  /** How far the walk has actually got. */
  readonly scannedToSec: number;
  /** Step forward to `sec`. Yields to the event loop periodically so a
   *  browser caller keeps painting. */
  advanceTo(sec: number): Promise<void>;
  /** The dataset covering everything stepped so far. */
  datasetTo(sec: number): DirectorDataset;
}

export async function createDirectorScanStream(
  buffer: ArrayBuffer,
): Promise<DirectorScanStream> {
  const recording = await createDemoStreamingRecording(buffer);
  const playback = recording.streamingPlayback;
  const durationSec = Number.isFinite(recording.duration)
    ? Math.max(recording.duration, FLAG_STEP_SEC)
    : FLAG_STEP_SEC;

  const trackers = new DirectorTrackers();
  const missionOverTime: { atSec: number; name: string }[] = [];
  const noteMission = (t: number): void => {
    const name = playback.missionDisplayName;
    if (!name) return;
    if (missionOverTime[missionOverTime.length - 1]?.name === name) return;
    missionOverTime.push({ atSec: t, name });
  };

  let cursor = 0;
  let exhausted = false;
  noteMission(0);

  const stream: DirectorScanStream = {
    durationSec,
    get scannedToSec() {
      return cursor;
    },
    async advanceTo(sec: number): Promise<void> {
      const target = Math.min(sec, durationSec);
      let lastYield = cursor;
      while (!exhausted && cursor <= target) {
        const snapshot = playback.stepToTime(cursor);
        trackers.step(snapshot, cursor);
        noteMission(cursor);
        if (snapshot.exhausted) {
          exhausted = true;
          break;
        }
        cursor += FLAG_STEP_SEC;
        if (cursor - lastYield >= YIELD_EVERY_SEC) {
          lastYield = cursor;
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }
    },
    datasetTo(sec: number): DirectorDataset {
      // The mission in effect when the match started, or the first seen.
      const matchStart = trackers.matchStartedAtSec;
      const missionAtMatch =
        (matchStart != null
          ? [...missionOverTime].reverse().find((m) => m.atSec <= matchStart)
          : undefined) ?? missionOverTime[0];
      return trackers.snapshot(
        {
          // The horizon, NOT the file's length: a switcher told the demo
          // runs for 25 minutes would plan against a timeline it has no
          // data for.
          durationSec: Math.min(sec, durationSec),
          gameClassName: playback.gameClassName,
          missionName: recording.missionName ?? null,
          missionDisplayName:
            missionAtMatch?.name ?? playback.missionDisplayName ?? null,
          gameType: recording.gameType ?? null,
          serverDisplayName:
            playback.serverDisplayName ?? recording.serverDisplayName ?? null,
        },
        sec,
      );
    },
  };
  return stream;
}
