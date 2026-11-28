import {
  MathUtils,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import {
  clipDurationMs,
  MAX_CLIP_DURATION_MS,
  sampleClipTake,
  sameClipFollowTarget,
  type ClipCameraTransition,
  type ClipSample,
  type ClipTake,
} from "../../relay/clipTypes";
import {
  clipStore,
  installClipStateGuards,
  retainFinalClipSample,
  shouldPauseClipRecording,
} from "../state/clipStore";
import { engineStore, type PlaybackSliceState } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import { resolveCameraOwner } from "../state/cameraOwner";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { clearInputDeltas } from "../state/inputControls";
import {
  findLivingEntityByTargetId,
  resolveFlagEntityId,
} from "../state/watchFollow";
import { exitDirector } from "../state/demoDirectorStore";
import { cameraTourStore } from "../state/cameraTourStore";
import { applyVerticalFov } from "./cameraFov";
import { FramePriority } from "./framePriority";
import { streamRenderFrame } from "../stream/interpolateEntity";
import { projectileFollowIdentity } from "../stream/projectileFollowIdentity";
import {
  clipCameraTransitionAt,
  sampleClipCameraTransition,
} from "../stream/clipJumpTransitions";
import type { GameEngine } from "./gameEngine";
import { combineCleanups } from "./storeReaction";

const SAMPLE_INTERVAL_MS = 1000 / 30;
const MAX_CLIP_EFFECTS_WAIT_SEC = 8;
const MAX_CLIP_RESOURCE_WAIT_SEC = 10;
const CLIP_RESOURCE_NOTICE_DELAY_SEC = 0.15;
const rounded = (value: number, places = 6) => Number(value.toFixed(places));

// Preserve horizontal framing on viewports with a different aspect ratio.
function clipVerticalFov(
  pose: Pick<ClipCameraTransition, "fov" | "aspect">,
  aspect: number,
): number {
  return (
    2 *
    MathUtils.radToDeg(
      Math.atan(
        (Math.tan(MathUtils.degToRad(pose.fov) / 2) * pose.aspect) / aspect,
      ),
    )
  );
}

type CameraFraming = Pick<
  ClipSample,
  | "position"
  | "quaternion"
  | "fov"
  | "aspect"
  | "projection"
  | "viewHeight"
  | "firstPersonPose"
  | "headYaw"
  | "orbitDistance"
>;

function readCameraFraming(engine: GameEngine): CameraFraming {
  const { active: camera, perspective } = engine.cameras;
  const ortho = camera instanceof OrthographicCamera;
  return {
    position: camera.position
      .toArray()
      .map((value) => rounded(value, 5)) as ClipSample["position"],
    quaternion: camera.quaternion
      .toArray()
      .map((value) => rounded(value, 7)) as ClipSample["quaternion"],
    fov: ortho ? perspective.fov : camera.fov,
    aspect: perspective.aspect,
    projection: ortho ? "orthographic" : "perspective",
    ...(ortho && { viewHeight: (camera.top - camera.bottom) / camera.zoom }),
  };
}

function cameraFramingChanged(a: CameraFraming, b: CameraFraming): boolean {
  if (a.projection !== b.projection) return true;
  if (
    a.projection === "perspective" &&
    Math.abs(clipVerticalFov(a, b.aspect) - b.fov) > 1e-6
  )
    return true;
  if (a.firstPersonPose && b.firstPersonPose)
    return (a.headYaw ?? 0) !== (b.headYaw ?? 0);
  // Equivalent signs and rounding drift do not change the orientation.
  const rotationDot = a.quaternion.reduce(
    (sum, value, axis) => sum + value * b.quaternion[axis],
    0,
  );
  if (
    Math.abs(rotationDot) <
    0.9999999 * Math.hypot(...a.quaternion) * Math.hypot(...b.quaternion)
  )
    return true;
  if (a.orbitDistance !== undefined && b.orbitDistance !== undefined)
    return Math.abs(a.orbitDistance - b.orbitDistance) > 0.01;
  return (
    a.viewHeight !== b.viewHeight ||
    Math.hypot(
      a.position[0] - b.position[0],
      a.position[1] - b.position[1],
      a.position[2] - b.position[2],
    ) > 0.01
  );
}

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
  const transitionPosition = new Vector3();
  const transitionRotation = new Quaternion();
  let recording = false;
  let elapsedMs = 0;
  let lastSampleMs = -Infinity;
  let lastSample: ClipSample | null = null;
  let previousFrame: {
    sample: ClipSample;
    zoomed: boolean;
    zoomDirection: number;
    zoomSpeedMs: number;
    zoomTarget: number | undefined;
  } | null = null;
  let skippedPause: { start: CameraFraming; moved?: boolean } | null = null;
  let lastQuickCamRecallNonce = 0;
  const finishSkippedPause = (pause: NonNullable<typeof skippedPause>) => {
    // Compare before the first resumed frame advances a moving target.
    pause.moved = cameraFramingChanged(pause.start, readCameraFraming(engine));
    lastQuickCamRecallNonce =
      streamPlaybackStore.getState().quickCamRecallNonce;
  };
  let lastFollowedBodyId: string | undefined;
  let lastFollowedBodyDead = false;
  let plannedMs = 0;
  let effectsDeadline: number | undefined;
  let resourcesWaitStartedAt: number | undefined;
  let resourcesReadyToRender = false;
  let resourcesRendered = false;
  const resetResourceWait = () => {
    resourcesWaitStartedAt = undefined;
    resourcesReadyToRender = false;
    resourcesRendered = false;
  };
  let planned: { take: ClipTake; sample: ClipSample } | null = null;
  const plannedSample = (take: ClipTake): ClipSample => {
    if (planned?.take !== take || planned.sample.timeMs !== plannedMs)
      planned = { take, sample: sampleClipTake(take, plannedMs) };
    return planned.sample;
  };
  const playbackSample = (take: ClipTake, playheadMs: number): ClipSample => {
    const intended = plannedSample(take);
    // After an asset hold the demo can be ahead. Let the clip catch up.
    return engineStore.getState().playback.status !== "seeking" &&
      intended.timeMs >= playheadMs &&
      intended.demoTimeSec - streamClock.time < 0.033
      ? intended
      : sampleClipTake(take, playheadMs);
  };
  let sourceTransport: Pick<PlaybackSliceState, "recording" | "rate"> | null =
    null;
  return combineCleanups(
    installClipStateGuards(),
    engine.onAfterRender?.(() => {
      if (resourcesReadyToRender) resourcesRendered = true;
    }),
    clipStore.subscribe((state, previous) => {
      if (state.active !== previous.active) {
        engine.clipCameraSample = null;
        resetResourceWait();
      }
      if (state.playbackEffects !== previous.playbackEffects)
        effectsDeadline = undefined;
      if (state.recording && !previous.recording) {
        recording = false;
        skippedPause = null;
      }
      if (previous.recording && !state.recording && document.pointerLockElement)
        document.exitPointerLock();
      if (state.active && !previous.active) {
        engine.cameras.resetZoom();
        engine.cameras.clearZoomPreview();
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
    engineStore.subscribe(
      (state) => state.playback.seekNonce,
      () => {
        // A reconstruction can finish later in the same frame.
        resetResourceWait();
        const clip = clipStore.getState();
        if (clip.active) plannedMs = clip.playheadMs;
        if (clip.awaitingResources)
          clipStore.setState({ awaitingResources: false });
      },
    ),
    engineStore.subscribe(
      (state) => state.playback.status,
      (status) => {
        if (!clipStore.getState().recording) return;
        if (
          shouldPauseClipRecording(
            status,
            settingsStore.getState().pauseClipRecordingWhenDemoPaused,
          )
        ) {
          skippedPause ??= { start: readCameraFraming(engine) };
          skippedPause.moved = undefined;
        } else if (skippedPause) finishSkippedPause(skippedPause);
      },
    ),
    () => {
      const clip = clipStore.getState();
      if (clip.recording || clip.draft) clip.discard();
      else clip.stopPlayback();
    },
    engine.scheduler.add(FramePriority.ClipTransport, ({ delta, elapsed }) => {
      resourcesReadyToRender = false;
      const clip = clipStore.getState();
      if (!clip.active) return;
      if (engineStore.getState().playback.status === "seeking") {
        plannedMs = clip.playheadMs;
        return;
      }
      engine.input.clear();
      const endMs = clip.draft ? clip.trimEndMs : clipDurationMs(clip.active);
      let playing = clip.playing;
      let awaitingResources = false;
      // The same demo lookahead runs for ordinary recordings and clips.
      // Give brief clips time to draw their prepared opening view at zero.
      if (
        playing &&
        !clip.draft &&
        clip.playheadMs === 0 &&
        engine.recordedResourcesReady &&
        settingsStore.getState().resourceLookaheadMs > 0
      ) {
        const waitingSec = elapsed - (resourcesWaitStartedAt ??= elapsed);
        if (waitingSec < MAX_CLIP_RESOURCE_WAIT_SEC) {
          resourcesReadyToRender = engine.recordedResourcesReady();
          if (!resourcesReadyToRender) resourcesRendered = false;
          playing = resourcesRendered;
          awaitingResources =
            !playing && waitingSec >= CLIP_RESOURCE_NOTICE_DELAY_SEC;
        }
      }
      if (awaitingResources !== clip.awaitingResources)
        clipStore.setState({ awaitingResources });
      // Let the renderer draw the starting view while its pipeline and LUT
      // load. Slow or failed effects must not prevent watching the clip.
      const effects = clip.playbackEffects;
      if (
        clip.playing &&
        clip.playheadMs === 0 &&
        effects?.getState().awaitingFirstFrame
      ) {
        effectsDeadline ??= elapsed + MAX_CLIP_EFFECTS_WAIT_SEC;
        const effectsTimedOut = elapsed >= effectsDeadline;
        if (effectsTimedOut) effects.setState({ awaitingFirstFrame: false });
        playing &&= effectsTimedOut;
      }
      plannedMs = Math.min(
        endMs,
        clip.playheadMs + (playing ? Math.max(0, delta * 1000) : 0),
      );
      const target = plannedSample(clip.active);
      const sourceAdvance = target.demoTimeSec - streamClock.time;
      if (playing && sourceAdvance > 1e-7 && delta > 0)
        transport("playing", Math.min(16, sourceAdvance / delta));
      else transport("paused");
    }),
    engine.scheduler.add(FramePriority.CameraSelect, () => {
      engine.clipFollowCamera = null;
      engine.clipCameraTransition = null;
      engine.recordingFollowEye = undefined;
      engine.recordingOrbitDistance = undefined;
      const clip = clipStore.getState();
      if (!clip.active) return;
      const target = playbackSample(clip.active, clip.playheadMs);
      engine.clipCameraSample = target;
      const transition = clipCameraTransitionAt(clip.active, target.timeMs);
      if (transition)
        engine.clipCameraTransition = sampleClipCameraTransition(
          transition,
          target.timeMs,
        );
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
        target.flagSlot !== null
          ? resolveFlagEntityId(target.flagSlot)
          : target.targetId === null
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
        const follow = engine.clipFollowCamera;
        engine.clipFollowCamera = null;
        if (sample.projection === "perspective" && follow) {
          camera.position.copy(follow.position);
          camera.quaternion.copy(follow.quaternion);
        } else {
          camera.position.fromArray(sample.position);
          camera.quaternion.fromArray(sample.quaternion);
        }
        const transition = engine.clipCameraTransition;
        if (transition && !follow?.orbitTransition) {
          const { from, fraction, aimFraction, origin } = transition;
          camera.position.lerp(
            origin?.position ?? transitionPosition.fromArray(from.position),
            1 - fraction,
          );
          camera.quaternion.slerp(
            origin?.quaternion ?? transitionRotation.fromArray(from.quaternion),
            1 - aimFraction,
          );
        }
        const matchingProjection =
          transition?.from.projection === sample.projection ? transition : null;
        if (camera instanceof PerspectiveCamera) {
          const fov = clipVerticalFov(sample, camera.aspect);
          applyVerticalFov(
            camera,
            matchingProjection
              ? MathUtils.lerp(
                  clipVerticalFov(matchingProjection.from, camera.aspect),
                  fov,
                  matchingProjection.fraction,
                )
              : fov,
          );
        } else {
          const height = matchingProjection
            ? MathUtils.lerp(
                matchingProjection.from.viewHeight!,
                sample.viewHeight!,
                matchingProjection.fraction,
              )
            : sample.viewHeight!;
          camera.zoom = (camera.top - camera.bottom) / height;
          camera.updateProjectionMatrix();
        }
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
      engine.invalidate();
      const playback = engineStore.getState().playback;
      if (
        shouldPauseClipRecording(
          playback.status,
          settingsStore.getState().pauseClipRecordingWhenDemoPaused,
        )
      ) {
        skippedPause ??= { start: readCameraFraming(engine) };
        return;
      }
      if (skippedPause && skippedPause.moved === undefined)
        finishSkippedPause(skippedPause);
      const resumed = skippedPause !== null;
      const movedWhilePaused = skippedPause?.moved;
      skippedPause = null;
      if (!recording) {
        recording = true;
        elapsedMs = 0;
        lastSampleMs = -Infinity;
        lastSample = null;
        previousFrame = null;
      } else
        elapsedMs = Math.min(MAX_CLIP_DURATION_MS, elapsedMs + delta * 1000);
      const camera = engine.cameras.active;
      const stream = streamPlaybackStore.getState();
      const quickCamRecalled =
        stream.quickCamRecallNonce !== lastQuickCamRecallNonce;
      lastQuickCamRecallNonce = stream.quickCamRecallNonce;
      const owner = resolveCameraOwner();
      const mode = owner === "input" ? stream.cameraMode : owner;
      const tracking =
        mode === "orbitOverride" && stream.projectileFollow?.kind === "tracking"
          ? stream.projectileFollow
          : undefined;
      const projectile = tracking
        ? projectileFollowIdentity(
            streamRenderFrame.current?.get(tracking.projectileId),
          )
        : undefined;
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
      const bodyId =
        mode === "original"
          ? streamRenderFrame.camera?.controlEntityId
          : (tracking?.projectileId ?? followedBody?.id);
      // While pulling out to orbit, PlayerView still samples aim for this body.
      // Retain the pose marker until the orbit has reached its endpoint.
      const followsViewPose =
        followedBody !== undefined &&
        streamRenderFrame.firstPersonPlayerId === followedBody.id;
      const firstPersonPose =
        engine.recordingFollowEye ??
        (followedBody &&
        (mode === "firstPersonOverride" ||
          (mode === "orbitOverride" && followsViewPose))
          ? followsViewPose && streamRenderFrame.maskFirstPersonPose
          : undefined);
      const aim = firstPersonPose ? streamRenderFrame.firstPersonAim : null;
      const orbitDistance =
        mode === "orbitOverride" &&
        camera instanceof PerspectiveCamera &&
        firstPersonPose === undefined &&
        (projectile ||
          stream.followTargetId != null ||
          stream.followFlagSlot != null)
          ? engine.recordingOrbitDistance
          : undefined;
      const sample: ClipSample = {
        timeMs: rounded(elapsedMs, 3),
        demoTimeSec: rounded(streamClock.time),
        ...readCameraFraming(engine),
        ...(aim && { headYaw: rounded(aim.headYaw) }),
        ...(firstPersonPose !== undefined && { firstPersonPose }),
        ...(orbitDistance !== undefined && {
          orbitDistance: rounded(orbitDistance, 5),
        }),
        ...(projectile &&
          camera instanceof PerspectiveCamera && { projectile }),
        cameraMode: mode,
        targetId: stream.followTargetId,
        flagSlot: stream.followFlagSlot,
        rate: playback.rate,
        playing: playback.status === "playing" || playback.status === "ending",
      };
      const zoomed =
        sample.projection === "perspective" && engine.cameras.hasViewerZoom;
      const previousSample = previousFrame?.sample;
      const capturesZoom =
        sample.projection === "perspective" &&
        (zoomed || previousFrame?.zoomed);
      const zoomDelta =
        capturesZoom && previousSample?.projection === "perspective"
          ? sample.fov - clipVerticalFov(previousSample, sample.aspect)
          : 0;
      const zoomDirection =
        Math.abs(zoomDelta) > 1e-6 ? Math.sign(zoomDelta) : 0;
      const { zoomSpeedMs } = settingsStore.getState();
      const zoomTarget = engine.cameras.zoomHorizontalFov;
      // Smooth zoom travels linearly in horizontal FOV. Capture its edges
      // exactly, then use the ordinary sample rate along each sweep.
      const zoomBoundary =
        zoomDirection !== 0 &&
        (zoomSpeedMs === 0 ||
          !engine.cameras.isZoomAnimating ||
          previousFrame?.zoomDirection !== zoomDirection ||
          previousFrame.zoomSpeedMs !== zoomSpeedMs ||
          previousFrame.zoomTarget !== zoomTarget);
      if (capturesZoom)
        sample.fovInterpolation =
          zoomDirection !== 0 && zoomSpeedMs === 0 ? "step" : "horizontal";
      let changedView = false;
      if (lastSample) {
        const modeChanged = mode !== lastSample.cameraMode;
        const targetChanged = !sameClipFollowTarget(sample, lastSample);
        const projectionChanged = sample.projection !== lastSample.projection;
        const bodyChanged =
          bodyId !== lastFollowedBodyId ||
          followedBodyDead !== lastFollowedBodyDead;
        const changingPerspective =
          !targetChanged &&
          !projectionChanged &&
          !bodyChanged &&
          followedBody !== undefined &&
          !followedBodyDead &&
          ((lastSample.cameraMode === "firstPersonOverride" &&
            mode === "orbitOverride") ||
            (lastSample.cameraMode === "orbitOverride" &&
              mode === "firstPersonOverride"));
        // Free-fly can detach in place from the previous perspective view.
        const detached =
          modeChanged && mode === "freeFly" && !projectionChanged;
        if (movedWhilePaused) sample.jump = "resume";
        else if (!changingPerspective && quickCamRecalled)
          sample.jump = "quickCam";
        else if (
          !changingPerspective &&
          (projectionChanged ||
            (!detached &&
              (targetChanged ||
                (modeChanged && cameraFramingChanged(sample, lastSample)))))
        )
          sample.jump = "cameraChange";

        if (sample.jump || (!detached && bodyChanged)) sample.cut = true;
        changedView = modeChanged || targetChanged || projectionChanged;
      }
      const forceSample =
        resumed ||
        sample.cut ||
        changedView ||
        zoomBoundary ||
        firstPersonPose !== lastSample?.firstPersonPose;
      if (forceSample && lastSample && sample.timeMs <= lastSample.timeMs) {
        // Keep both sides of a jump when two rendered frames share a timestamp.
        elapsedMs = lastSample.timeMs + 0.001;
        sample.timeMs = rounded(elapsedMs, 3);
      }
      if (
        zoomBoundary &&
        sample.fovInterpolation === "horizontal" &&
        !sample.cut &&
        previousSample &&
        previousSample.timeMs > (lastSample?.timeMs ?? -1) &&
        previousSample.timeMs < sample.timeMs
      ) {
        // Anchor the sweep at the last rendered frame before it changed.
        state.appendSample(previousSample);
      }
      if (
        elapsedMs - lastSampleMs >= SAMPLE_INTERVAL_MS ||
        forceSample ||
        sample.timeMs === MAX_CLIP_DURATION_MS
      ) {
        state.appendSample(sample);
        lastSampleMs = elapsedMs;
        lastSample = sample;
        lastFollowedBodyId = bodyId;
        lastFollowedBodyDead = followedBodyDead;
      } else if (zoomDirection !== 0) {
        retainFinalClipSample(sample);
      }
      previousFrame = {
        sample,
        zoomed,
        zoomDirection,
        zoomSpeedMs,
        zoomTarget,
      };
      if (sample.timeMs === MAX_CLIP_DURATION_MS) state.stop();
    }),
  );
}
