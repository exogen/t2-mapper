import { createLogger } from "../logger";
import { engineStore, type PlaybackSliceState } from "../state/engineStore";
import {
  CAST_LOCAL_PLAN,
  demoDirectorStore,
  setCommentaryPreload,
} from "../state/demoDirectorStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { commentarySidecarUrl } from "../stream/demoIndex";
import {
  commentaryTrackKey,
  loadCommentaryTrack,
} from "../state/commentaryTrack";
import { commentaryTracksStore } from "../state/commentaryTracksStore";
import { commentaryPlayback, streamClock } from "../state/streamPlaybackStore";
import { settingsStore } from "../state/settingsStore";
import { FramePriority } from "./framePriority";
import { combineCleanups, reaction } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

const log = createLogger("commentary");

/** Drift beyond this snaps the audio clock (seeks, long stalls). */
const HARD_SNAP_SEC = 0.4;
/** Smaller drift is trimmed away by nudging playbackRate up to ±5%. */
const RATE_TRIM_MAX = 0.05;
const RATE_TRIM_GAIN = 0.25;
/**
 * Commentary plays only at near-normal transport speeds — outside this
 * band (frame-stepping, fast-forward) speech is noise, and browsers
 * reject extreme playbackRate values outright. The track pauses and
 * rejoins in sync when the rate comes back.
 */
const MIN_PLAY_RATE = 0.5;
const MAX_PLAY_RATE = 2;

interface ArmedTrack {
  key: string;
  ready: boolean;
  unavailable: boolean;
  fallbackSrc: string | null;
  blocked: boolean;
  audioStartSec: number;
}

function transportPlaying({ status, rate }: PlaybackSliceState): boolean {
  return status === "playing" && rate >= MIN_PLAY_RATE && rate <= MAX_PLAY_RATE;
}

/**
 * Plays the pre-rendered commentary track (`<demo>.commentary.m4a`, an
 * R2 sidecar like the cast plan) alongside auto-directed demo playback.
 *
 * The track is authored on the demo clock — from demo zero for a batch
 * render, or from the second its slice began for a live-loop stitch
 * (the cue file says which) — so sync is a clock-chase problem: every
 * frame the audio position is compared to `streamClock.time` less that
 * start. Pause and rate follow the transport, small drift (stutter,
 * decode hiccups) is trimmed by scaling playbackRate, and big
 * divergence (a seek) hard-snaps `currentTime`.
 */
export function installCommentaryAudio(engine: GameEngine): () => void {
  const audio = new Audio();
  let armed: ArmedTrack | null = null;
  let wasDirecting = false;
  let pendingPlay: Promise<void> | null = null;

  audio.preload = "auto";
  audio.preservesPitch = true;

  const hasFutureData = () =>
    audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  const isIdle = () => audio.paused && pendingPlay === null;
  const offAir = () => {
    commentaryPlayback.active = false;
  };
  const onPlaying = () => {
    commentaryPlayback.active =
      !!armed &&
      armed.ready &&
      !armed.unavailable &&
      !audio.paused &&
      !audio.ended &&
      !audio.seeking &&
      hasFutureData();
  };
  const onError = () => {
    if (!armed) return;
    offAir();
    pendingPlay = null;
    // Tracks stitched before the Opus/MP4 switch sit in the bucket as
    // mp3; try that once before giving the track up.
    if (armed.fallbackSrc) {
      const fallback = armed.fallbackSrc;
      armed.fallbackSrc = null;
      audio.src = fallback;
      return;
    }
    armed.unavailable = true;
  };
  const onCanPlayThrough = () => {
    log.info(`commentary track available (${Math.round(audio.duration)}s)`);
  };
  const pause = () => {
    offAir();
    if (isIdle()) return;
    pendingPlay = null;
    audio.pause();
  };

  /** Stop the track and release it: clearing the src plus load()
   *  aborts any in-flight download. */
  const disarm = () => {
    armed = null;
    wasDirecting = false;
    commentaryPlayback.startSec = null;
    pause();
    audio.removeAttribute("src");
    audio.load();
  };

  // Keep the element pointed at the current demo's chosen track: tear
  // down on a demo switch or a track switch, and — only when the
  // director wants audio — set the new sidecar URL, so a demo watched
  // without CastGenius never downloads the track.
  const arm = (wantTrack: boolean): ArmedTrack | null => {
    const sourceUrl = demoLoadStore.getState().sidecarSourceUrl;
    const track = commentaryTracksStore.getState().selected();
    // The demo plus the track: a picker change mid-broadcast swaps
    // the file and rejoins in sync on the next frame.
    const armKey = sourceUrl ? commentaryTrackKey(sourceUrl, track) : null;
    if (armed && armed.key !== armKey) {
      disarm();
    }
    // Commentary follows the sidecar plan. It is fetched only when wanted
    // and enabled, since setting src starts the download.
    if (
      armed ||
      !wantTrack ||
      !sourceUrl ||
      !armKey ||
      CAST_LOCAL_PLAN ||
      !settingsStore.getState().commentaryEnabled
    )
      return armed;

    const next: ArmedTrack = {
      key: armKey,
      ready: false,
      unavailable: false,
      fallbackSrc: commentarySidecarUrl(sourceUrl, track, "mp3"),
      blocked: false,
      audioStartSec: 0,
    };
    armed = next;
    audio.src = commentarySidecarUrl(sourceUrl, track, "m4a");
    // The cue file locates this track's first sample on the demo clock.
    void loadCommentaryTrack(sourceUrl, track)
      .then((loaded) => {
        if (armed !== next) return;
        next.audioStartSec = loaded?.audioStartSec ?? 0;
        next.ready = true;
        if (loaded && loaded.cues.length > 0) {
          commentaryPlayback.startSec = loaded.cues[0].atSec;
        }
      })
      .catch((err: unknown) => {
        if (armed !== next) return;
        next.unavailable = true;
        log.warn("commentary metadata failed: %o", err);
      });
    return next;
  };

  const play = (track: ArmedTrack) => {
    track.blocked = false;
    const attempt = audio.play();
    pendingPlay = attempt;
    void attempt.then(
      () => {
        if (pendingPlay === attempt) pendingPlay = null;
      },
      (err: unknown) => {
        if (pendingPlay !== attempt) return;
        pendingPlay = null;
        const name = (err as DOMException).name;
        if (name === "NotAllowedError") {
          track.blocked = true;
        } else if (name !== "AbortError") {
          log.warn(`commentary playback failed: ${String(err)}`);
          track.unavailable = true;
          pause();
        }
      },
    );
  };

  const sync = (fromGesture = false) => {
    const directing = demoDirectorStore.getState().status === "playing";
    const track = arm(directing);
    const playback = engineStore.getState().playback;
    const position = streamClock.time - (track?.audioStartSec ?? 0);
    if (
      !track?.ready ||
      track.unavailable ||
      !directing ||
      !transportPlaying(playback) ||
      !Number.isFinite(audio.duration) ||
      position < 0 ||
      position >= audio.duration
    ) {
      pause();
      wasDirecting = directing;
      return;
    }

    const buffered = hasFutureData();
    // A browser may hold at metadata until play() is called in a gesture.
    const gestureStart =
      fromGesture &&
      isIdle() &&
      audio.readyState >= HTMLMediaElement.HAVE_METADATA;
    const drift = audio.currentTime - position;
    if (!wasDirecting || Math.abs(drift) > HARD_SNAP_SEC) {
      // Resnapping during buffering can repeatedly restart the download.
      if (
        !audio.seeking &&
        (buffered || gestureStart) &&
        audio.currentTime !== position
      ) {
        offAir();
        audio.currentTime = position;
      }
    } else {
      // Audio ahead → slow it a touch; behind → hurry it.
      const trim = Math.min(
        RATE_TRIM_MAX,
        Math.max(-RATE_TRIM_MAX, drift * RATE_TRIM_GAIN),
      );
      const target = playback.rate * (1 - trim);
      if (Math.abs(audio.playbackRate - target) > 0.005) {
        audio.playbackRate = target;
      }
    }
    wasDirecting = true;
    if (isIdle() && (gestureStart || (buffered && !track.blocked))) play(track);
  };

  const startOnGesture = () => {
    if (isIdle()) sync(true);
  };
  const mediaEvents = [
    ["waiting", offAir],
    ["pause", offAir],
    ["ended", offAir],
    ["seeking", offAir],
    ["emptied", offAir],
    ["playing", onPlaying],
    // A buffered seek can finish without a new playing event.
    ["seeked", onPlaying],
    ["error", onError],
    ["canplaythrough", onCanPlayThrough],
  ] as const;
  const gestures = ["click", "touchend", "keydown"];
  for (const [type, handler] of mediaEvents)
    audio.addEventListener(type, handler);
  for (const event of gestures) window.addEventListener(event, startOnGesture);

  // Begin fetching alongside camera startup. Playback below joins the
  // current picture when metadata and audio arrive; it never gates the camera.
  setCommentaryPreload(() => {
    arm(true);
  });

  return combineCleanups(
    () => {
      for (const event of gestures)
        window.removeEventListener(event, startOnGesture);
      for (const [type, handler] of mediaEvents)
        audio.removeEventListener(type, handler);
      setCommentaryPreload(null);
      disarm();
    },
    // Toggling the "Play commentary" preference off mid-broadcast stops
    // the track and aborts its download; toggling back on re-arms and
    // rejoins in sync on the next frame.
    reaction(
      settingsStore,
      (state) => state.commentaryEnabled,
      (enabled) => {
        if (!enabled && armed) disarm();
      },
    ),
    reaction(
      settingsStore,
      (state) => state.audioVolume,
      (volume) => {
        audio.volume = Math.min(1, Math.max(0, volume));
      },
    ),
    reaction(
      engineStore,
      (state) => transportPlaying(state.playback),
      (playing) => {
        if (!playing) pause();
      },
    ),
    reaction(
      demoDirectorStore,
      (state) => state.status === "playing",
      (directing) => {
        if (!directing) {
          wasDirecting = false;
          pause();
        }
      },
    ),
    engine.scheduler.add(FramePriority.AudioSync, () => sync()),
  );
}
