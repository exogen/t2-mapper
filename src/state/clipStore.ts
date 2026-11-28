import { createStore } from "zustand/vanilla";
import { DEFAULT_PLAYER_INTERPOLATION } from "../stream/playerInterpolation";
import {
  clipDurationMs,
  MAX_CLIP_SAMPLES,
  readClipTake,
  sampleClipTake,
  type ClipSample,
  type ClipTake,
} from "../../relay/clipTypes";
import { appAccountStore } from "./appAccountStore";
import { demoLoadStore } from "./demoLoadStore";
import { publishedDemoFilename } from "./editableGame";
import {
  addPlaybackSeekGuard,
  engineStore,
  type PlaybackStatus,
} from "./engineStore";
import {
  createClipGraphicsEffectsStore,
  type GraphicsEffectsStore,
} from "./graphicsEffectsStore";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { streamSnapshotStore } from "./streamSnapshotStore";
import {
  smoothClipTake,
  type ClipSmoothingLevel,
} from "../stream/clipSmoothing";
import {
  applyClipJumpTransitions,
  clipJumpTransitionEnd,
  clipJumpTransitionEndInRange,
} from "../stream/clipJumpTransitions";

export interface ClipState {
  recording: boolean;
  draft: ClipTake | null;
  trimStartMs: number;
  trimEndMs: number;
  elapsedMs: number;
  active: ClipTake | null;
  playbackEffects: GraphicsEffectsStore | null;
  awaitingResources: boolean;
  playheadMs: number;
  playing: boolean;
  smoothingLevel: ClipSmoothingLevel;
  jumpTransitions: ReadonlySet<number>;
  start(): boolean;
  stop(): void;
  discard(): void;
  play(take: ClipTake): void;
  pause(): void;
  resume(): void;
  stopPlayback(): void;
  setTrimRange(startMs: number, endMs: number): void;
  setSmoothingLevel(level: ClipSmoothingLevel): void;
  toggleJumpTransition(timeMs: number): void;
  seek(timeMs: number): boolean;
  /** Engine-owned final rendered camera samples. */
  appendSample(sample: ClipSample): void;
}

let samples: ClipSample[] = [];
let sourceDemo: string | null = null;
let recordingOwner: string | null = null;
let captureInterpolation = DEFAULT_PLAYER_INTERPOLATION;
let releaseCaptureInterpolation: (() => void) | undefined;
let clipSeekDepth = 0;
const NO_JUMP_TRANSITIONS: ReadonlySet<number> = new Set();

function releaseCapture(): void {
  releaseCaptureInterpolation?.();
  releaseCaptureInterpolation = undefined;
}

export function shouldPauseClipRecording(
  status: PlaybackStatus,
  pauseWhenDemoPaused: boolean,
): boolean {
  // A newly opened demo is stopped until its first Play.
  return pauseWhenDemoPaused && (status === "paused" || status === "stopped");
}

/** Wait for the opening scene and its collision reconstruction before capturing. */
export function canStartClipRecording(): boolean {
  const { playback } = engineStore.getState();
  const stream = playback.recording?.streamingPlayback;
  return (
    playback.recording?.source === "demo" &&
    playback.status !== "seeking" &&
    !playback.seekFailed &&
    !!stream &&
    streamPlaybackStore.getState().playback === stream &&
    streamSnapshotStore.getState().snapshot !== null &&
    stream.canStartSeek !== false &&
    !stream.needsReplay
  );
}

/** Clip-controlled seeks retain the draft and its camera ownership. */
export function seekClipSource(timeSec: number): boolean {
  if (clipStore.getState().recording)
    return engineStore.getState().seekPlayback(timeSec);
  clipSeekDepth++;
  try {
    return engineStore.getState().seekPlayback(timeSec);
  } finally {
    clipSeekDepth--;
  }
}

export const clipStore = createStore<ClipState>((set, get) => ({
  recording: false,
  draft: null,
  trimStartMs: 0,
  trimEndMs: 0,
  elapsedMs: 0,
  active: null,
  playbackEffects: null,
  awaitingResources: false,
  playheadMs: 0,
  playing: false,
  smoothingLevel: 0,
  jumpTransitions: NO_JUMP_TRANSITIONS,
  start() {
    if (get().recording) return false;
    const account = appAccountStore.getState();
    const filename = publishedDemoFilename(demoLoadStore.getState().sourceUrl);
    const stream = engineStore.getState().playback.recording?.streamingPlayback;
    if (
      !account.user ||
      account.pending ||
      !stream ||
      !canStartClipRecording() ||
      !filename ||
      get().active ||
      get().draft
    )
      return false;
    samples = [];
    sourceDemo = filename;
    recordingOwner = account.user.discordId;
    captureInterpolation =
      stream.currentPlayerInterpolation ?? DEFAULT_PLAYER_INTERPOLATION;
    releaseCaptureInterpolation =
      stream.holdPlayerInterpolation?.(captureInterpolation);
    set({
      recording: true,
      elapsedMs: 0,
      smoothingLevel: 0,
      jumpTransitions: NO_JUMP_TRANSITIONS,
    });
    return true;
  },
  stop() {
    if (!get().recording) return;
    const durationMs = samples.at(-1)?.timeMs ?? 0;
    if (!sourceDemo || samples.length < 2 || durationMs < 1000) {
      get().discard();
      return;
    }
    const draft: ClipTake = {
      version: 1,
      sourceDemo,
      playerInterpolation: captureInterpolation,
      samples: [...samples],
    };
    samples = [];
    sourceDemo = null;
    recordingOwner = null;
    set({
      recording: false,
      draft,
      active: draft,
      trimStartMs: 0,
      trimEndMs: durationMs,
      playheadMs: durationMs,
      playing: false,
      smoothingLevel: 0,
    });
    engineStore.getState().setPlaybackStatus("paused");
  },
  discard() {
    releaseCapture();
    samples = [];
    sourceDemo = null;
    recordingOwner = null;
    set({
      recording: false,
      draft: null,
      active: null,
      playbackEffects: null,
      awaitingResources: false,
      trimStartMs: 0,
      trimEndMs: 0,
      elapsedMs: 0,
      playheadMs: 0,
      playing: false,
      smoothingLevel: 0,
      jumpTransitions: NO_JUMP_TRANSITIONS,
    });
  },
  play(take) {
    if (get().draft)
      throw new Error(
        "Save or discard the current clip before playing another.",
      );
    const active = readClipTake(take);
    if (get().recording) get().discard();
    set({
      active,
      playbackEffects: active.graphicsEffects
        ? createClipGraphicsEffectsStore(active.graphicsEffects)
        : null,
      awaitingResources: false,
      playheadMs: 0,
      playing: true,
      smoothingLevel: 0,
    });
  },
  pause() {
    set({ playing: false, awaitingResources: false });
  },
  resume() {
    const state = get();
    if (!state.active) return;
    const end = state.draft ? state.trimEndMs : clipDurationMs(state.active);
    if (state.playheadMs >= end) {
      if (!get().seek(state.draft ? state.trimStartMs : 0)) return;
    }
    set({ playing: true });
  },
  stopPlayback() {
    if (get().draft) {
      get().pause();
      return;
    }
    set({
      active: null,
      playbackEffects: null,
      awaitingResources: false,
      playing: false,
      playheadMs: 0,
      smoothingLevel: 0,
    });
  },
  setTrimRange(startMs, endMs) {
    const state = get();
    if (!state.draft || !Number.isFinite(startMs) || !Number.isFinite(endMs))
      return;
    const duration = clipDurationMs(state.draft);
    const start = Math.max(0, Math.min(duration - 1, startMs));
    const end = Math.max(start + 1, Math.min(duration, endMs));
    set({
      trimStartMs: start,
      trimEndMs: end,
      playing: false,
      ...(end !== state.trimEndMs &&
        state.active &&
        state.jumpTransitions.size && {
          active: applyClipJumpTransitions(
            state.active,
            state.jumpTransitions,
            end,
          ),
        }),
    });
    engineStore.getState().setPlaybackStatus("paused");
    const time =
      end !== state.trimEndMs
        ? end
        : start !== state.trimStartMs
          ? start
          : Math.max(start, Math.min(end, state.playheadMs));
    if (time !== state.playheadMs) get().seek(time);
  },
  setSmoothingLevel(level) {
    const state = get();
    if (!state.draft || level === state.smoothingLevel) return;
    set({
      smoothingLevel: level,
      active: applyClipJumpTransitions(
        smoothClipTake(state.draft, level),
        state.jumpTransitions,
        state.trimEndMs,
      ),
    });
  },
  toggleJumpTransition(timeMs) {
    const state = get();
    if (!state.draft || !state.active) return;
    const samples = state.draft.samples;
    const index = samples.findIndex((sample) => sample.timeMs === timeMs);
    if (
      clipJumpTransitionEndInRange(
        timeMs,
        clipJumpTransitionEnd(samples, index),
        state.trimStartMs,
        state.trimEndMs,
      ) === undefined
    )
      return;
    const jumpTransitions = new Set(state.jumpTransitions);
    if (!jumpTransitions.delete(timeMs)) jumpTransitions.add(timeMs);
    set({
      jumpTransitions,
      active: applyClipJumpTransitions(
        state.active,
        jumpTransitions,
        state.trimEndMs,
      ),
    });
  },
  seek(timeMs) {
    const state = get();
    if (!state.active || !Number.isFinite(timeMs)) return false;
    const start = state.draft ? state.trimStartMs : 0;
    const end = state.draft ? state.trimEndMs : clipDurationMs(state.active);
    const time = Math.max(start, Math.min(end, timeMs));
    const target = sampleClipTake(state.active, time);
    set({ playing: !state.draft && state.playing, awaitingResources: false });
    engineStore.getState().setPlaybackStatus("paused");
    if (!seekClipSource(target.demoTimeSec)) return false;
    set({ playheadMs: time });
    return true;
  },
  appendSample(sample) {
    if (!get().recording || !sourceDemo) return;
    if (samples.length && sample.timeMs === samples.at(-1)!.timeMs) {
      samples[samples.length - 1] = sample;
      return;
    }
    if (samples.length && sample.timeMs < samples.at(-1)!.timeMs) return;
    if (samples.length >= MAX_CLIP_SAMPLES) {
      get().stop();
      return;
    }
    samples.push(sample);
    set({ elapsedMs: sample.timeMs });
  },
}));

/** Installed with the engine so discontinuities discard even between rendered frames. */
export function installClipStateGuards(): () => void {
  const removeSeekGuard = addPlaybackSeekGuard(
    () =>
      clipSeekDepth > 0 ||
      (!clipStore.getState().draft &&
        (!clipStore.getState().recording ||
          globalThis.confirm(
            "Seeking will discard your current clip recording. Discard it and seek?",
          ))),
  );
  const stopForNavigation = (discardDraft = false) => {
    const state = clipStore.getState();
    if (state.recording || (discardDraft && state.draft)) state.discard();
    else if (state.active) state.stopPlayback();
  };
  const stopEngine = engineStore.subscribe((state, previous) => {
    if (state.playback.recording !== previous.playback.recording)
      stopForNavigation(true);
    else if (state.playback.seekNonce !== previous.playback.seekNonce) {
      if (
        !clipSeekDepth &&
        state.playback.seekIntentNonce !== previous.playback.seekIntentNonce
      )
        stopForNavigation();
      else if (clipStore.getState().recording) clipStore.getState().discard();
    }
  });
  const stopSource = demoLoadStore.subscribe((state, previous) => {
    if (
      state.sourceUrl !== previous.sourceUrl ||
      state.requestedDemo !== previous.requestedDemo ||
      state.requestedUrl !== previous.requestedUrl ||
      (state.phase !== previous.phase &&
        (state.phase === "parsing" || state.phase === "downloading"))
    )
      stopForNavigation(true);
  });
  const stopAccount = appAccountStore.subscribe((state, previous) => {
    const clip = clipStore.getState();
    if (
      (clip.recording &&
        (state.pending || state.user?.discordId !== recordingOwner)) ||
      (clip.draft &&
        (state.pending || state.user?.discordId !== previous.user?.discordId))
    )
      clipStore.getState().discard();
  });
  return () => {
    removeSeekGuard();
    stopEngine();
    stopSource();
    stopAccount();
  };
}
