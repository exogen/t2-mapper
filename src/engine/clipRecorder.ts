import { OrthographicCamera, PerspectiveCamera } from "three";
import {
  clipDurationMs,
  MAX_CLIP_DURATION_MS,
  sampleClipTake,
  type ClipSample,
  type ClipTake,
} from "../../relay/clipTypes";
import { clipStore, installClipStateGuards } from "../state/clipStore";
import { engineStore, type PlaybackSliceState } from "../state/engineStore";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import { resolveCameraOwner } from "../state/cameraOwner";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { clearInputDeltas } from "../state/inputControls";
import { findLivingEntityByTargetId } from "../state/watchFollow";
import { exitDirector } from "../state/demoDirectorStore";
import { cameraTourStore } from "../state/cameraTourStore";
import { FramePriority } from "./framePriority";
import { streamRenderFrame } from "../stream/interpolateEntity";
import type { GameEngine } from "./gameEngine";
import { combineCleanups } from "./storeReaction";

const SAMPLE_INTERVAL_MS = 1000 / 30;
const rounded = (value: number, places = 6) => Number(value.toFixed(places));

function transport(status: "playing" | "paused", rate?: number) {
  engineStore.setState((state) =>
    state.playback.status === status &&
    (rate === undefined || state.playback.rate === rate)
      ? state
      : {
          playback: {
            ...state.playback,
            status,
            ...(rate !== undefined && { rate }),
          },
        },
  );
}

/** Capture the final rendered view; recorded clips own the same camera rig on replay. */
export function installClipRecorder(engine: GameEngine): () => void {
  let recording = false;
  let elapsedMs = 0;
  let lastSampleMs = -Infinity;
  let lastSample: ClipSample | null = null;
  let lastFollowedBodyId: string | undefined;
  let lastFollowedBodyDead = false;
  let plannedMs = 0;
  let planned: { take: ClipTake; sample: ClipSample } | null = null;
  const plannedSample = (take: ClipTake): ClipSample => {
    if (planned?.take !== take || planned.sample.timeMs !== plannedMs)
      planned = { take, sample: sampleClipTake(take, plannedMs) };
    return planned.sample;
  };
  const playbackSample = (take: ClipTake, playheadMs: number): ClipSample => {
    const intended = plannedSample(take);
    return engineStore.getState().playback.status !== "seeking" &&
      Math.abs(streamClock.time - intended.demoTimeSec) < 0.033
      ? intended
      : sampleClipTake(take, playheadMs);
  };
  let sourceTransport: Pick<PlaybackSliceState, "recording" | "rate"> | null =
    null;
  return combineCleanups(
    installClipStateGuards(),
    clipStore.subscribe((state, previous) => {
      if (state.active !== previous.active) engine.clipCameraSample = null;
      if (state.recording && !previous.recording) recording = false;
      if (previous.recording && !state.recording && document.pointerLockElement)
        document.exitPointerLock();
      if (state.active && !previous.active) {
        const { recording, rate } = engineStore.getState().playback;
        sourceTransport = { recording, rate };
        plannedMs = state.playheadMs;
        exitDirector();
        cameraTourStore.getState().cancel();
      }
      if (previous.active && !state.active) {
        planned = null;
        if (
          sourceTransport &&
          engineStore.getState().playback.recording ===
            sourceTransport.recording
        )
          engineStore.getState().setPlaybackRate(sourceTransport.rate);
        sourceTransport = null;
        engine.cameras.setActive(
          commandCircuitStore.getState().active
            ? engine.cameras.ortho
            : engine.cameras.perspective,
        );
        engine.input.clear();
        clearInputDeltas();
      }
      engine.invalidate();
    }),
    () => {
      const clip = clipStore.getState();
      if (clip.recording || clip.draft) clip.discard();
      else clip.stopPlayback();
    },
    engine.scheduler.add(FramePriority.ClipTransport, ({ delta }) => {
      const clip = clipStore.getState();
      if (!clip.active) return;
      if (engineStore.getState().playback.status === "seeking") {
        plannedMs = clip.playheadMs;
        return;
      }
      engine.input.clear();
      const endMs = clip.draft ? clip.trimEndMs : clipDurationMs(clip.active);
      plannedMs = Math.min(
        endMs,
        clip.playheadMs + (clip.playing ? Math.max(0, delta * 1000) : 0),
      );
      const target = plannedSample(clip.active);
      const sourceAdvance = target.demoTimeSec - streamClock.time;
      if (clip.playing && sourceAdvance > 1e-7 && delta > 0)
        transport("playing", Math.min(16, sourceAdvance / delta));
      else transport("paused");
    }),
    engine.scheduler.add(FramePriority.CameraSelect, () => {
      const clip = clipStore.getState();
      if (!clip.active) return;
      const target = playbackSample(clip.active, clip.playheadMs);
      engine.clipCameraSample = target;
      const orthographic = target.projection === "orthographic";
      if (commandCircuitStore.getState().active !== orthographic)
        commandCircuitStore.setState({ active: orthographic });
      const stream = streamPlaybackStore.getState();
      const cameraMode =
        target.cameraMode === "original" ||
        target.cameraMode === "orbitOverride" ||
        target.cameraMode === "firstPersonOverride"
          ? target.cameraMode
          : "freeFly";
      const entityId =
        target.targetId === null
          ? null
          : findLivingEntityByTargetId(target.targetId);
      if (
        stream.cameraMode !== cameraMode ||
        stream.followTargetId !== target.targetId ||
        stream.followFlagSlot !== target.flagSlot ||
        stream.followEntityId !== entityId
      )
        streamPlaybackStore.setState({
          cameraMode,
          followTargetId: target.targetId,
          followFlagSlot: target.flagSlot,
          followEntityId: entityId,
          followPlayer: null,
        });
    }),
    engine.scheduler.add(FramePriority.ClipCamera, ({ delta }) => {
      const state = clipStore.getState();
      if (state.active) {
        const sample =
          engine.clipCameraSample ??
          playbackSample(state.active, state.playheadMs);
        engine.clipCameraSample = null;
        const time = sample.timeMs;
        const camera =
          sample.projection === "orthographic"
            ? engine.cameras.ortho
            : engine.cameras.perspective;
        engine.cameras.setActive(camera);
        camera.position.fromArray(sample.position);
        camera.quaternion.fromArray(sample.quaternion);
        if (camera instanceof PerspectiveCamera) {
          // Preserve the recorded horizontal framing on differently shaped viewports.
          camera.fov =
            (2 *
              Math.atan(
                (Math.tan((sample.fov * Math.PI) / 360) * sample.aspect) /
                  camera.aspect,
              ) *
              180) /
            Math.PI;
        } else camera.zoom = (camera.top - camera.bottom) / sample.viewHeight!;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        if (time !== state.playheadMs) clipStore.setState({ playheadMs: time });
        const endMs = state.draft
          ? state.trimEndMs
          : clipDurationMs(state.active);
        if (time >= endMs) {
          if (state.playing) clipStore.setState({ playing: false });
          transport("paused");
        }
        if (state.playing) engine.invalidate();
        recording = false;
        return;
      }
      if (!state.recording) {
        recording = false;
        return;
      }
      if (!recording) {
        recording = true;
        elapsedMs = 0;
        lastSampleMs = -Infinity;
        lastSample = null;
      } else
        elapsedMs = Math.min(MAX_CLIP_DURATION_MS, elapsedMs + delta * 1000);
      engine.invalidate();
      const camera = engine.cameras.active;
      const playback = engineStore.getState().playback;
      const stream = streamPlaybackStore.getState();
      const owner = resolveCameraOwner();
      const mode = owner === "input" ? stream.cameraMode : owner;
      // A player's target ID stays the same when their body changes.
      const followedEntity =
        (mode === "firstPersonOverride" || mode === "orbitOverride") &&
        stream.followFlagSlot == null &&
        stream.followEntityId
          ? gameEntityStore.getState().streamEntities.get(stream.followEntityId)
          : undefined;
      const followedBody =
        followedEntity?.renderType === "Player" ? followedEntity : undefined;
      const followedBodyDead = (followedBody?.damageState ?? 0) !== 0;
      const aim =
        mode === "firstPersonOverride" &&
        streamRenderFrame.firstPersonPlayerId === followedBody?.id
          ? streamRenderFrame.firstPersonAim
          : null;
      const sample: ClipSample = {
        timeMs: rounded(elapsedMs, 3),
        demoTimeSec: rounded(streamClock.time),
        position: camera.position
          .toArray()
          .map((value) => rounded(value, 5)) as ClipSample["position"],
        quaternion: camera.quaternion
          .toArray()
          .map((value) => rounded(value, 7)) as ClipSample["quaternion"],
        fov:
          camera instanceof PerspectiveCamera
            ? camera.fov
            : engine.cameras.perspective.fov,
        aspect: engine.cameras.perspective.aspect,
        projection:
          camera instanceof OrthographicCamera ? "orthographic" : "perspective",
        ...(camera instanceof OrthographicCamera && {
          viewHeight: (camera.top - camera.bottom) / camera.zoom,
        }),
        ...(aim && { headYaw: rounded(aim.headYaw) }),
        cameraMode: mode,
        targetId: stream.followTargetId,
        flagSlot: stream.followFlagSlot,
        rate: playback.rate,
        playing: playback.status === "playing" || playback.status === "ending",
      };
      const cut =
        lastSample !== null &&
        (sample.cameraMode !== lastSample.cameraMode ||
          sample.targetId !== lastSample.targetId ||
          sample.flagSlot !== lastSample.flagSlot ||
          sample.projection !== lastSample.projection ||
          followedBody?.id !== lastFollowedBodyId ||
          followedBodyDead !== lastFollowedBodyDead);
      if (
        elapsedMs - lastSampleMs >= SAMPLE_INTERVAL_MS ||
        cut ||
        elapsedMs === MAX_CLIP_DURATION_MS
      ) {
        if (cut) sample.cut = true;
        state.appendSample(sample);
        lastSampleMs = elapsedMs;
        lastSample = sample;
        lastFollowedBodyId = followedBody?.id;
        lastFollowedBodyDead = followedBodyDead;
      }
      if (elapsedMs >= MAX_CLIP_DURATION_MS) state.stop();
    }),
  );
}
