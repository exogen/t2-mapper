/** Optional, causal telemetry. Independent of the archive CastPlan contract. */
import type {
  DirectorPlayerSample,
  DirectorVec3,
  Shot,
  ShotSubject,
} from "./types";

export const DIRECTOR_OBSERVATION_VERSION = 1;

export interface ObservedPlayer extends DirectorPlayerSample {
  /** Together with streamId, targetId and generation identify an occupant.
   * Null generation means identity continuity is unknown, not generation zero. */
  targetGeneration: number | null;
  clientId: number | null;
  /** Name as observed at this sample, never the final roster's name. */
  name: string | null;
}

export interface ObservedFlag {
  slot: number;
  teamId: number | null;
  pos: DirectorVec3;
  carrierTargetId: number | null;
  /** Missing server status is unknown unless a carrier is observed. */
  status: "home" | "held" | "field" | "unknown";
}

/** A complete sampled state of scoped players/flags, not a delta. Absence
 * means unobserved, not dead/disconnected. Sampling time is not a guarantee
 * that every ghost received a fresh network update at that instant. */
export interface DirectorStateFrame {
  streamId: string;
  /** Starts at 1; independent of the fact journal's sequence. */
  sequence: number;
  timeSec: number;
  availableAtSec: number;
  players: ObservedPlayer[];
  flags: ObservedFlag[];
  teams: { teamId: number; name: string; score: number }[];
  match: {
    /** Signed server clock: negative counts down, positive counts up.
     * Neither file duration nor a positive clock proves overtime. */
    clockMs: number | null;
    started: boolean;
    ended: boolean;
  };
}

/** A perspective camera in Torque coordinates. Supplied by the camera
 * owner; observation code never moves it or estimates a follow path. */
export interface DirectorCameraView {
  eye: DirectorVec3;
  forward: DirectorVec3;
  up: DirectorVec3;
  verticalFovDeg: number;
  aspect: number;
  near: number;
  far: number;
}

export interface DirectorCameraFrame {
  streamId: string;
  /** Picture timestamp, not the planner's lookahead cursor. */
  timeSec: number;
  /** When this decision/pose became available on the source clock. */
  availableAtSec: number;
  /** IDs and revisions belong to the camera publisher. A new decision
   * or reset must not reuse an old identity for an unrelated shot. */
  shot: {
    id: string;
    revision: number;
    kind: Shot["kind"];
    subject: ShotSubject | null;
  };
  commitment: "provisional" | "committed";
  poseSource: "rendered" | "planned" | "unknown";
  view: DirectorCameraView | null;
}

/** Geometry is an estimate at a sampled entity point, not proof that the
 * rendered model is visible. Importance never changes these fields. */
export interface DirectorPointVisibility {
  inFrustum: boolean | null;
  lineOfSight: "clear" | "blocked" | "unknown";
  visibility: "estimated-visible" | "off-camera" | "unknown";
}

export interface FramedPlayer extends ObservedPlayer {
  /** Null when no fresh, committed camera decision is known. */
  focus: boolean | null;
  camera: DirectorPointVisibility;
}

export interface FramedFlag extends ObservedFlag {
  /** Null when no fresh, committed camera decision is known. */
  focus: boolean | null;
  camera: DirectorPointVisibility;
}

export interface DirectorObservedState extends Omit<
  DirectorStateFrame,
  "players" | "flags"
> {
  ageSec: number;
  fresh: boolean;
  players: FramedPlayer[];
  flags: FramedFlag[];
}

export interface DirectorObservedCamera extends DirectorCameraFrame {
  ageSec: number;
  fresh: boolean;
}

export interface DirectorObservation {
  version: typeof DIRECTOR_OBSERVATION_VERSION;
  streamId: string;
  /** Viewer/picture timestamp for which this observation was requested. */
  timeSec: number;
  /** Only evidence already available by this source timestamp may be used. */
  availableThroughSec: number;
  state: DirectorObservedState | null;
  camera: DirectorObservedCamera | null;
}

/** State frames can be recorded without a camera, model, or audio track.
 * A camera trace, when supplied, must come from its actual owner; do not
 * relabel archive midpoint scene descriptions as rendered observations. */
export interface DirectorObservationTrace {
  format: "t2-director-observations";
  version: typeof DIRECTOR_OBSERVATION_VERSION;
  streamId: string;
  throughSec: number;
  states: DirectorStateFrame[];
  cameras: DirectorCameraFrame[];
}
