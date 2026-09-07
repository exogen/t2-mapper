/** Pull-only observations of the picture at an explicit timestamp. This
 * module consumes state/camera output; it cannot make camera decisions. */
import {
  DIRECTOR_OBSERVATION_VERSION,
  type DirectorCameraFrame,
  type DirectorCameraView,
  type DirectorObservation,
  type DirectorPointVisibility,
  type DirectorStateFrame,
} from "./observationContract";
import type { DirectorVec3 } from "./types";
import { detached } from "./stateJournal";

export interface LiveObservationRequest {
  timeSec: number;
  availableThroughSec: number;
  camera?: DirectorCameraFrame | null;
  /** Hold-last-sample limits; stale state is retained but explicitly marked. */
  maxStateAgeSec?: number;
  maxCameraAgeSec?: number;
  /** Optional consumer-side geometry query. Must represent the world at the
   * picture timestamp. No query means unknown occlusion, never clear sight. */
  lineOfSight?: (
    eye: DirectorVec3,
    point: DirectorVec3,
  ) => "clear" | "blocked" | "unknown";
}

const unknownVisibility = (): DirectorPointVisibility => ({
  inFrustum: null,
  lineOfSight: "unknown",
  visibility: "unknown",
});
const dot = (a: DirectorVec3, b: DirectorVec3) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: DirectorVec3, b: DirectorVec3): DirectorVec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function unit(v: DirectorVec3): DirectorVec3 | null {
  const length = Math.hypot(...v);
  return Number.isFinite(length) && length > 1e-9
    ? (v.map((n) => n / length) as DirectorVec3)
    : null;
}

/** Frustum and optional point occlusion, deliberately independent of event
 * importance. In-frustum alone does not establish on-camera visibility. */
export function observeDirectorPoint(
  point: DirectorVec3,
  view: DirectorCameraView,
  lineOfSight?: LiveObservationRequest["lineOfSight"],
): DirectorPointVisibility {
  const { eye, verticalFovDeg, aspect, near, far } = view;
  const forward = unit(view.forward);
  const right = forward && unit(cross(forward, view.up));
  if (
    !forward ||
    !right ||
    ![...point, ...eye, verticalFovDeg, aspect, near, far].every(
      Number.isFinite,
    ) ||
    verticalFovDeg <= 0 ||
    verticalFovDeg >= 180 ||
    aspect <= 0 ||
    near < 0 ||
    far <= near
  ) {
    return unknownVisibility();
  }
  const up = cross(right, forward);
  const offset = point.map((n, i) => n - eye[i]) as DirectorVec3;
  const depth = dot(offset, forward);
  const halfHeight = depth * Math.tan((verticalFovDeg * Math.PI) / 360);
  const inside =
    depth > 0 &&
    depth >= near &&
    depth <= far &&
    Math.abs(dot(offset, right)) <= halfHeight * aspect &&
    Math.abs(dot(offset, up)) <= halfHeight;
  if (!inside)
    return {
      inFrustum: false,
      lineOfSight: "unknown",
      visibility: "off-camera",
    };
  const sight = lineOfSight?.([...eye], [...point]) ?? "unknown";
  return {
    inFrustum: true,
    lineOfSight: sight,
    visibility:
      sight === "clear"
        ? "estimated-visible"
        : sight === "blocked"
          ? "off-camera"
          : "unknown",
  };
}

/** Reuse for incoming live drains, browser demo drains, or batch traces.
 * Reads may seek; appends must retain their original source order. Owns only
 * telemetry history, never a ShotPlan or a commentary generator. */
export class DirectorObservationReplay {
  readonly streamId: string;
  private readonly states: DirectorStateFrame[] = [];

  constructor(streamId: string, states: readonly DirectorStateFrame[] = []) {
    if (!streamId.trim())
      throw new Error("An observation replay needs a stream id");
    this.streamId = streamId;
    this.append(states);
  }

  /** Validate shape against the generated schema when loading untrusted JSON.
   * These checks additionally enforce timeline/epoch continuity. Atomic on error. */
  append(states: readonly DirectorStateFrame[]): void {
    let previous = this.states.at(-1);
    for (const frame of states) {
      if (
        frame.streamId !== this.streamId ||
        frame.sequence !== (previous?.sequence ?? 0) + 1 ||
        !Number.isFinite(frame.timeSec) ||
        !Number.isFinite(frame.availableAtSec) ||
        frame.availableAtSec < frame.timeSec ||
        frame.timeSec < (previous?.timeSec ?? -Infinity) ||
        frame.availableAtSec < (previous?.availableAtSec ?? -Infinity) ||
        frame.players.some((p) => p.timeSec !== frame.timeSec)
      ) {
        throw new Error("Invalid director state timeline or stream identity");
      }
      previous = frame;
    }
    for (const state of detached([...states])) this.states.push(state);
  }

  observe(request: LiveObservationRequest): DirectorObservation {
    const {
      timeSec,
      availableThroughSec,
      maxStateAgeSec = 1.5,
      maxCameraAgeSec = 0.25,
    } = request;
    if (
      ![timeSec, availableThroughSec, maxStateAgeSec, maxCameraAgeSec].every(
        Number.isFinite,
      ) ||
      availableThroughSec < timeSec ||
      maxStateAgeSec < 0 ||
      maxCameraAgeSec < 0
    ) {
      throw new Error(
        "Observation needs finite ordered clocks and nonnegative freshness limits",
      );
    }
    // Both constraints are monotonic in the source trace. Never choose the
    // nearest sample or interpolate using a sample after the picture time.
    let lo = 0;
    let hi = this.states.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const frame = this.states[mid];
      if (
        frame.timeSec <= timeSec &&
        frame.availableAtSec <= availableThroughSec
      )
        lo = mid + 1;
      else hi = mid;
    }
    const state = this.states[lo - 1];
    const sourceCamera = request.camera;
    if (
      sourceCamera &&
      (sourceCamera.streamId !== this.streamId ||
        !Number.isFinite(sourceCamera.timeSec) ||
        !Number.isFinite(sourceCamera.availableAtSec) ||
        (sourceCamera.poseSource === "rendered" &&
          sourceCamera.availableAtSec < sourceCamera.timeSec) ||
        !sourceCamera.shot.id.trim() ||
        !Number.isInteger(sourceCamera.shot.revision) ||
        sourceCamera.shot.revision < 1)
    ) {
      throw new Error("Invalid director camera identity or timestamps");
    }
    // A planned future pose can be available early, but is not the picture yet.
    const camera =
      sourceCamera &&
      sourceCamera.timeSec <= timeSec &&
      sourceCamera.availableAtSec <= availableThroughSec
        ? {
            ...sourceCamera,
            ageSec: timeSec - sourceCamera.timeSec,
            fresh: timeSec - sourceCamera.timeSec <= maxCameraAgeSec,
          }
        : null;
    const ageSec = state ? timeSec - state.timeSec : Infinity;
    const fresh = ageSec <= maxStateAgeSec;
    const subject = camera?.shot.subject;
    const knownFocus = camera?.fresh && camera.commitment === "committed";
    const pointVisibility = (pos: DirectorVec3) =>
      fresh &&
      camera?.fresh &&
      camera.commitment === "committed" &&
      camera.poseSource === "rendered" &&
      camera.view
        ? observeDirectorPoint(pos, camera.view, request.lineOfSight)
        : unknownVisibility();
    return detached({
      version: DIRECTOR_OBSERVATION_VERSION,
      streamId: this.streamId,
      timeSec,
      availableThroughSec,
      camera,
      state: state
        ? {
            ...state,
            ageSec,
            fresh,
            players: state.players.map((p) => ({
              ...p,
              focus: !knownFocus
                ? null
                : subject?.type === "player"
                  ? subject.targetId === p.targetId
                  : subject?.type === "flag" &&
                    state.flags.some(
                      (f) =>
                        f.slot === subject.slot &&
                        f.carrierTargetId === p.targetId,
                    ),
              camera: pointVisibility(p.pos),
            })),
            flags: state.flags.map((f) => ({
              ...f,
              focus: knownFocus
                ? subject?.type === "flag" && subject.slot === f.slot
                : null,
              camera: pointVisibility(f.pos),
            })),
          }
        : null,
    });
  }
}
