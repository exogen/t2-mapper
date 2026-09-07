import { useCallback, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { createLogger } from "../logger";
import { engineStore } from "../state/engineStore";
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
import { useSettings } from "./SettingsProvider";

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
 * divergence (a seek) hard-snaps `currentTime`. If the sidecar doesn't exist, the element errors once
 * and the feature stays off for this demo.
 */
export function CommentaryAudio() {
  const { audioVolume, commentaryEnabled } = useSettings();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** `${sourceUrl}#${trackKey}` of the armed track, or null. */
  const armedKeyRef = useRef<string | null>(null);
  /** Audio waits for its own clock metadata; the camera never does. */
  const trackReadyRef = useRef(false);
  const unavailableRef = useRef(false);
  /** The legacy mp3 URL for the armed track, tried once on error. */
  const fallbackSrcRef = useRef<string | null>(null);
  const blockedRef = useRef(false);
  const wasDirectingRef = useRef(false);
  /** Demo time at the track's first sample. A batch render starts at
   *  demo zero; a live-loop stitch starts where its slice began, and
   *  says so in the cue file (`livesim.audioStartSec`). */
  const audioStartRef = useRef(0);
  /** Track position for a demo time. */
  const trackTime = (demoSec: number) => demoSec - audioStartRef.current;

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.preservesPitch = true;
    audio.addEventListener("error", () => {
      // Ignore errors surfaced by teardown (no track armed).
      if (armedKeyRef.current == null) return;
      // Tracks stitched before the Opus/MP4 switch sit in the bucket as
      // mp3; try that once before giving the track up.
      if (fallbackSrcRef.current) {
        audio.src = fallbackSrcRef.current;
        fallbackSrcRef.current = null;
        return;
      }
      unavailableRef.current = true;
    });
    audio.addEventListener("canplaythrough", () => {
      log.info(`commentary track available (${Math.round(audio.duration)}s)`);
    });
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      // Abort any in-flight download — clearing src alone doesn't.
      audio.load();
      audioRef.current = null;
      armedKeyRef.current = null;
      unavailableRef.current = false;
      blockedRef.current = false;
      commentaryPlayback.active = false;
      commentaryPlayback.startSec = null;
    };
  }, []);

  /** Stop the track and release it: clearing the src plus load()
   *  aborts any in-flight download. */
  const disarm = useCallback((audio: HTMLAudioElement) => {
    armedKeyRef.current = null;
    trackReadyRef.current = false;
    unavailableRef.current = false;
    blockedRef.current = false;
    wasDirectingRef.current = false;
    audioStartRef.current = 0;
    commentaryPlayback.startSec = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, []);

  // Toggling the "Play commentary" preference off mid-broadcast stops
  // the track and aborts its download; toggling back on re-arms and
  // rejoins in sync on the next frame.
  useEffect(() => {
    const audio = audioRef.current;
    if (!commentaryEnabled && audio && armedKeyRef.current != null) {
      disarm(audio);
      commentaryPlayback.active = false;
    }
  }, [commentaryEnabled, disarm]);

  // Keep the element pointed at the current demo's chosen track: tear
  // down on a demo switch or a track switch, and — only when the
  // director wants audio — set the new sidecar URL, so a demo watched
  // without CastGenius never downloads the track. Returns whether an
  // armed track is playable.
  const arm = useCallback(
    (wantTrack: boolean): boolean => {
      const audio = audioRef.current;
      if (!audio) return false;
      const sourceUrl = demoLoadStore.getState().sourceUrl;
      const track = commentaryTracksStore.getState().selected();
      // The demo plus the track: a picker change mid-broadcast swaps
      // the file and rejoins in sync on the next frame.
      const armKey = sourceUrl ? commentaryTrackKey(sourceUrl, track) : null;
      if (armedKeyRef.current != null && armedKeyRef.current !== armKey) {
        disarm(audio);
      }
      // CAST_LOCAL_PLAN debugging suppresses commentary entirely: its
      // cues were timed against the sidecar plan, not the local one.
      if (
        armedKeyRef.current == null &&
        wantTrack &&
        sourceUrl &&
        armKey &&
        !CAST_LOCAL_PLAN &&
        // The "Play commentary" preference: off = the camera cast runs
        // as usual, but the audio is never fetched (arming sets the src,
        // which starts the download).
        commentaryEnabled
      ) {
        armedKeyRef.current = armKey;
        trackReadyRef.current = false;
        fallbackSrcRef.current = commentarySidecarUrl(sourceUrl, track, "mp3");
        audio.src = commentarySidecarUrl(sourceUrl, track, "m4a");
        // The cue file locates this track's first sample on the demo
        // clock. Wait for that offset before playing audio, and accept
        // the result only while this track is still armed.
        void loadCommentaryTrack(sourceUrl, track)
          .then((loaded) => {
            if (armedKeyRef.current !== armKey) return;
            audioStartRef.current = loaded?.audioStartSec ?? 0;
            trackReadyRef.current = true;
            if (loaded && loaded.cues.length > 0) {
              commentaryPlayback.startSec = loaded.cues[0].atSec;
            }
          })
          .catch((err: unknown) => {
            if (armedKeyRef.current !== armKey) return;
            unavailableRef.current = true;
            log.warn("commentary metadata failed: %o", err);
          });
      }
      return armedKeyRef.current != null && !unavailableRef.current;
    },
    [commentaryEnabled, disarm],
  );

  // Begin fetching alongside camera startup. Playback below joins the
  // current picture when metadata and audio arrive; it never gates the camera.
  useEffect(() => {
    setCommentaryPreload(() => {
      arm(true);
    });
    return () => setCommentaryPreload(null);
  }, [arm]);

  // Autoplay can be denied when the director starts without a recent
  // user gesture (e.g. auto-start); retry on the next interaction.
  useEffect(() => {
    const retry = () => {
      blockedRef.current = false;
    };
    window.addEventListener("pointerdown", retry);
    window.addEventListener("keydown", retry);
    return () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
    };
  }, []);

  useFrame(() => {
    const audio = audioRef.current;
    commentaryPlayback.active = audio != null && !audio.paused && !audio.ended;
    if (!audio) return;
    // The track follows the master volume slider (game sounds route
    // through the AudioListener; this element doesn't).
    const volume = Math.min(1, Math.max(0, audioVolume));
    if (audio.volume !== volume) audio.volume = volume;
    const directing = demoDirectorStore.getState().status === "playing";
    // Fetch only once directing runs (the optional preload can arm first);
    // re-checking the armed URL swaps tracks on a demo switch.
    if (!directing && armedKeyRef.current == null) return;
    if (!arm(directing)) {
      if (!audio.paused) audio.pause();
      return;
    }
    const { status, rate } = engineStore.getState().playback;
    const position = trackTime(streamClock.time);
    const shouldPlay =
      trackReadyRef.current &&
      directing &&
      status === "playing" &&
      rate >= MIN_PLAY_RATE &&
      rate <= MAX_PLAY_RATE &&
      Number.isFinite(audio.duration) &&
      position >= 0 &&
      position < audio.duration;

    if (!shouldPlay) {
      if (!audio.paused) audio.pause();
      wasDirectingRef.current = directing;
      return;
    }

    const drift = audio.currentTime - position;
    if (!wasDirectingRef.current || Math.abs(drift) > HARD_SNAP_SEC) {
      // Snap only when the element has data to play from: while it's
      // buffering, a seek restarts the network fetch, so re-snapping
      // every frame would thrash and never let it recover. A stalled
      // element gets one snap the moment it's ready again.
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        audio.currentTime = position;
      }
    } else {
      // Audio ahead → slow it a touch; behind → hurry it.
      const trim = Math.min(
        RATE_TRIM_MAX,
        Math.max(-RATE_TRIM_MAX, drift * RATE_TRIM_GAIN),
      );
      const target = rate * (1 - trim);
      if (Math.abs(audio.playbackRate - target) > 0.005) {
        audio.playbackRate = target;
      }
    }
    wasDirectingRef.current = true;

    if (
      audio.paused &&
      !blockedRef.current &&
      audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
    ) {
      audio.play().catch((err: unknown) => {
        const name = (err as DOMException).name;
        if (name === "NotAllowedError") {
          // Autoplay denied — wait for the next user gesture.
          blockedRef.current = true;
        } else if (name !== "AbortError") {
          // AbortError just means a pause superseded this play().
          // Anything else (decode/network) disables the track.
          log.warn(`commentary playback failed: ${String(err)}`);
          unavailableRef.current = true;
        }
      });
    }
  });

  return null;
}
