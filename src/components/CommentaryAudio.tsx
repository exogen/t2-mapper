import { useCallback, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { createLogger } from "../logger";
import { engineStore } from "../state/engineStore";
import {
  DIRECTOR_INTRO_LEAD_SEC,
  demoDirectorStore,
  setCommentaryGate,
} from "../state/demoDirectorStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { commentaryPlayback, streamClock } from "../state/streamPlaybackStore";

const log = createLogger("commentary");

/** Drift beyond this snaps the audio clock (seeks, long stalls). */
const HARD_SNAP_SEC = 0.4;
/** Smaller drift is trimmed away by nudging playbackRate up to ±5%. */
const RATE_TRIM_MAX = 0.05;
const RATE_TRIM_GAIN = 0.25;
/** How long the director start waits for the track (see the gate). */
const HEADSTART_MS = 3000;
/**
 * Commentary plays only at near-normal transport speeds — outside this
 * band (frame-stepping, fast-forward) speech is noise, and browsers
 * reject extreme playbackRate values outright. The track pauses and
 * rejoins in sync when the rate comes back.
 */
const MIN_PLAY_RATE = 0.5;
const MAX_PLAY_RATE = 2;

/**
 * Plays the pre-rendered commentary track (`<demo>.commentary.mp3`, an
 * R2 sidecar like the cast plan) alongside auto-directed demo playback.
 *
 * The track is authored on the demo clock (leading silence up to the
 * first cue), so sync is a clock-chase problem: every frame the audio
 * position is compared to `streamClock.time` — pause/rate follow the
 * transport, small drift (stutter, decode hiccups) is trimmed by
 * scaling playbackRate, and big divergence (a seek) hard-snaps
 * `currentTime`. If the sidecar doesn't exist, the element errors once
 * and the feature stays off for this demo.
 */
export function CommentaryAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const armedUrlRef = useRef<string | null>(null);
  const startFetchedForRef = useRef<string | null>(null);
  const unavailableRef = useRef(false);
  const blockedRef = useRef(false);
  const wasDirectingRef = useRef(false);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.preservesPitch = true;
    audio.addEventListener("error", () => {
      // Ignore errors surfaced by teardown (no track armed).
      if (armedUrlRef.current != null) unavailableRef.current = true;
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
      armedUrlRef.current = null;
      unavailableRef.current = false;
      blockedRef.current = false;
      commentaryPlayback.active = false;
      commentaryPlayback.startSec = null;
    };
  }, []);

  // Keep the element pointed at the current demo's track: tear down on
  // a demo switch, and — only when the director wants audio — set the
  // new sidecar URL, so a demo watched without CastGenius never
  // downloads the track. Returns whether an armed track is playable.
  const arm = useCallback((wantTrack: boolean): boolean => {
    const audio = audioRef.current;
    if (!audio) return false;
    const sourceUrl = demoLoadStore.getState().sourceUrl;
    if (armedUrlRef.current != null && armedUrlRef.current !== sourceUrl) {
      armedUrlRef.current = null;
      startFetchedForRef.current = null;
      unavailableRef.current = false;
      blockedRef.current = false;
      wasDirectingRef.current = false;
      commentaryPlayback.startSec = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (armedUrlRef.current == null && wantTrack && sourceUrl) {
      armedUrlRef.current = sourceUrl;
      audio.src = `${sourceUrl}.commentary.mp3`;
    }
    return armedUrlRef.current != null && !unavailableRef.current;
  }, []);

  // The director start awaits this gate: begin the download and give
  // it a bounded head start, buffering at the position playback will
  // begin from (the browser range-requests there, not from byte 0).
  useEffect(() => {
    setCommentaryGate(async () => {
      const audio = audioRef.current;
      if (!arm(true) || !audio) return;
      // The cue transcript sidecar tells us where the broadcast means
      // to begin (its intro may run ahead of the plan's first scene);
      // the director reads commentaryPlayback.startSec for its seek.
      const url = armedUrlRef.current;
      if (url && startFetchedForRef.current !== url) {
        startFetchedForRef.current = url;
        try {
          const res = await fetch(`${url}.commentary.json`);
          if (res.ok) {
            const meta = (await res.json()) as {
              format?: string;
              cues?: { atSec?: number }[];
            };
            const at = meta.cues?.[0]?.atSec;
            if (
              meta.format === "castgenius-commentary" &&
              typeof at === "number"
            ) {
              commentaryPlayback.startSec = at;
            }
          }
        } catch {
          // No transcript sidecar — the plan's own start applies.
        }
      }
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          audio.removeEventListener("canplay", done);
          audio.removeEventListener("error", done);
          audio.removeEventListener("loadedmetadata", onMetadata);
          resolve();
        };
        const onMetadata = () => {
          // Buffer where playback will actually begin — the director
          // seeks to the intro MINUS its lead-in, and pre-seeking to
          // the speech itself instead would force a first-frame snap
          // against an unbuffered position (heard as the opening line
          // clipping or stuttering).
          const startAt =
            commentaryPlayback.startSec ??
            demoDirectorStore.getState().plan?.skipToSec ??
            0;
          audio.currentTime = Math.max(
            streamClock.time,
            startAt - DIRECTOR_INTRO_LEAD_SEC,
          );
        };
        const timer = setTimeout(done, HEADSTART_MS);
        if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) onMetadata();
        else audio.addEventListener("loadedmetadata", onMetadata);
        audio.addEventListener("canplay", done);
        audio.addEventListener("error", done);
      });
    });
    return () => setCommentaryGate(null);
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
    const directing = demoDirectorStore.getState().status === "playing";
    // Fetch only once CastGenius runs (the pre-start gate normally arms
    // first); re-checking the armed URL swaps tracks on a demo switch.
    if (!directing && armedUrlRef.current == null) return;
    if (!arm(directing)) {
      if (!audio.paused) audio.pause();
      return;
    }
    const { status, rate } = engineStore.getState().playback;
    const shouldPlay =
      directing &&
      status === "playing" &&
      rate >= MIN_PLAY_RATE &&
      rate <= MAX_PLAY_RATE &&
      Number.isFinite(audio.duration) &&
      streamClock.time < audio.duration;

    if (!shouldPlay) {
      if (!audio.paused) audio.pause();
      wasDirectingRef.current = directing;
      return;
    }

    const drift = audio.currentTime - streamClock.time;
    if (!wasDirectingRef.current || Math.abs(drift) > HARD_SNAP_SEC) {
      // Snap only when the element has data to play from: while it's
      // buffering, a seek restarts the network fetch, so re-snapping
      // every frame would thrash and never let it recover. A stalled
      // element gets one snap the moment it's ready again.
      if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        audio.currentTime = streamClock.time;
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

    if (audio.paused && !blockedRef.current) {
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
