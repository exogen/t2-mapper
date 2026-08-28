import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import type { Camera } from "three";
import { createLogger } from "../logger";
import { engineStore } from "../state/engineStore";
import { cameraRegistry } from "../state/cameraRegistry";
import { demoDirectorStore, exitDirector } from "../state/demoDirectorStore";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  enterWatchFollow,
  exitToFreeFly,
  findLivingEntityByTargetId,
  followFlag,
  resolveFlagEntityId,
} from "../state/watchFollow";
import { orbitPullbackDir } from "../stream/streamHelpers";
import {
  inputControlsStore,
  useInputAction,
  type DragState,
  type TouchState,
} from "./InputControls";
import type {
  DirectorVec3 as DirectorVec3Tuple,
  Shot,
} from "../director/types";
import { demoClock, describeShot } from "../director/shotLog";
import { bearingYaw } from "../director/geometry";

/**
 * Shot debugging: every cut, travel and mid-shot correction logs at
 * info under the "director" module, timestamped like the seek bar, so
 * a moment seen in playback can be quoted and matched to a decision.
 * `LOG_LEVEL=director:debug` adds the quieter rails.
 */
const log = createLogger("director");
import {
  AIM_TOWARD_MIN_RANGE,
  AIM_TURN_RATE,
  DOLLY_AIM_DAMPING,
  DOLLY_DAMPING,
  DOLLY_DEFAULT_DISTANCE,
  DOLLY_DEFAULT_HEIGHT,
  DOLLY_LOOK_LIFT,
  DOLLY_SIDE_ANGLE,
  FOLLOW_YAW_DRIFT,
  GROUND_MIN_CLEARANCE,
  ORBIT_HEIGHT_FACTOR,
  ORBIT_LOOK_LIFT,
  PARAM_EASE_RATE,
  STANDOFF_MIN,
  STANDOFF_MIN_SCALE,
  STATIC_PAN_DAMPING,
  PAN_STATE_COMMIT_SEC,
  findOpeningsByRay,
  surfaceLiftedAnchor,
  findDoorwaysFromPaths,
  type Doorway,
  SUBJECT_MAX_RANGE,
  SWEEP_LIFT_STEPS,
  TRANSITION_ARM_FRAMES,
  TRANSITION_MAX_DISTANCE,
  TRANSITION_MAX_SEC,
  TRANSITION_MIN_DISTANCE,
  TRANSITION_MIN_SEC,
  TRANSITION_SPEED,
  VISIBILITY_BLOCKED_STRIKES,
  VISIBILITY_CHECK_SEC,
  VISIBILITY_YAW_OFFSETS,
  approachAngle,
  DOLLY_HEADING_RATE,
  DOLLY_VELOCITY_SMOOTHING,
  REANCHOR_COOLDOWN_SEC,
  REANCHOR_MAX_SWEEP_RAD,
  REANCHOR_MAX_SWEEP_RATE,
  REANCHOR_MIN_REMAINING_SEC,
  CORRECTION_MIN_REMAINING_SEC,
  chooseClearPlacement,
  orbitBearingOf,
  clearStandoff,
  clearStandoffWide,
  subjectViewBlocked,
  easeInHold,
  easeInOutCubic,
  groundHeightAt,
  viewBlocked,
} from "../director/cameraRig";
import {
  findShotIndex,
  keepFollowAboveGround,
  livingPlayerPositionsNear,
  resolveShotSubjectGroup,
  resolveSubjectGroup,
  shotContains,
  shotSubjectOf,
  subjectHeading,
  subjectVelocity,
} from "../director/shotSubjects";

const _transitionTargetPos = new Vector3();
const _transitionTargetQuat = new Quaternion();
const _visCandidate = new Vector3();
const _visForward = new Vector3();
const _visNewAim = new Vector3();
const _subjectPos = new Vector3();

/**
 * Doors near a hold, from the demo's own player paths — computed once
 * per (dataset, area) and cached: the roof probes across every sample
 * near the hold are a one-time cost, and doors do not move.
 */
const _doorCache = new WeakMap<object, Map<string, Doorway[]>>();
function doorwaysNear(holdTorque: DirectorVec3Tuple): Doorway[] {
  const dataset = demoDirectorStore.getState().dataset;
  if (!dataset) return [];
  let byArea = _doorCache.get(dataset);
  if (!byArea) _doorCache.set(dataset, (byArea = new Map()));
  const key = `${Math.round(holdTorque[0] / 20)},${Math.round(holdTorque[1] / 20)}`;
  let doors = byArea.get(key);
  if (!doors) {
    doors = findDoorwaysFromPaths(dataset.playerSamples, holdTorque, 60);
    byArea.set(key, doors);
    log.debug(
      "doorways near [%d, %d]: %s",
      Math.round(holdTorque[0]),
      Math.round(holdTorque[1]),
      doors
        .map((d) => `[${d.pos.map((v) => v.toFixed(0))}]x${d.crossings}`)
        .join(" ") || "none",
    );
  }
  return doors;
}
/**
 * Whether a flag subject sits at (near) its own home stand — the
 * signature of a return or capture teleport, as opposed to sliding.
 */
function flagAtHomeStand(
  slot: number,
  threePos: { x: number; z: number },
): boolean {
  const stand = demoDirectorStore
    .getState()
    .dataset?.flagStands.find((s) => s.slot === slot);
  if (!stand) return false;
  return Math.hypot(threePos.x - stand.pos[1], threePos.z - stand.pos[0]) <= 25;
}

const _sweepFrom = new Vector3();
const _sweepTo = new Vector3();
const _dollyDesired = new Vector3();
const _dollySubject = new Vector3();
const _dollyVelocity = new Vector3();
const _dollyOut = new Vector3();
const _staticLook = new Vector3();

/**
 * Auto-director playback driver — while demoDirectorStore is "playing",
 * looks up the planned shot for the current demo time each frame and
 * drives the existing follow/orbit selection state (watchFollow +
 * StreamingController do the actual camera work, inheriting respawn
 * re-lock and flag hand-off), positioning the camera directly only for
 * fixedOrbit establishing shots. Every camera input is one interrupt
 * back to free-fly; the plan is demo-time-indexed, so seeks and speed
 * changes re-sync in a single frame.
 */
export function DirectorController() {
  const shotIndexRef = useRef(-1);
  const appliedShotRef = useRef<Shot | null>(null);
  const orbitAngleRef = useRef(0);
  const heightScaleRef = useRef(1);
  const radiusScaleRef = useRef(1);
  /**
   * Where a fixed shot is orbiting RIGHT NOW. A shot's planned centre is
   * where its subject was when the plan was made; when the subject has
   * since moved out from behind cover — or simply moved — the camera has
   * to re-anchor on where they actually are, or it keeps framing the
   * spot they left.
   */
  const centerOverrideRef = useRef<DirectorVec3Tuple | null>(null);
  // Shot-to-shot travel: where the camera was when the shot changed,
  // and how far through the move we are. "armed" means the new pose
  // hasn't been measured yet (it is only known once this frame's shot
  // has written the camera).
  const travelFromRef = useRef(new Vector3());
  const travelFromQuatRef = useRef(new Quaternion());
  const travelStateRef = useRef<"idle" | "armed" | "active">("idle");
  const travelElapsedRef = useRef(0);
  const travelDurationRef = useRef(0);
  /** Floor on the next travel's duration — a correction whose turn
   *  would be too quick stretches its flight instead of being refused. */
  const travelMinDurationRef = useRef(0);
  const travelArmedFramesRef = useRef(0);
  const sweepLiftRef = useRef(0);
  const visibilityTimerRef = useRef(0);
  const visibilityStrikesRef = useRef(0);
  const visibilityYawRef = useRef<number | null>(null);
  /**
   * A shorter orbit standoff that fits the space the subject is in, when
   * the shot's own distance does not. Cleared when the shot changes.
   */
  const visibilityDistanceRef = useRef<number | null>(null);
  /** Demo time of the last visibility correction (cooldown). */
  const lastCorrectionRef = useRef(-Infinity);
  /** Consecutive too-disruptive holds within one shot: after two, the
   *  sweep cap is waived — being parked on a wall for the rest of the
   *  shot is worse than one big (paced) move. */
  const budgetHoldsRef = useRef(0);
  /** Recent fixed-shot anchors and their orbit phases, so cutting back
   *  to the same spot RESUMES the orbit instead of restarting it from
   *  the planned angle — three restarts of the same rotation read as a
   *  broken record. A short ring, because the classic churn is A-B-A:
   *  a single-slot memory is erased by the B in between. */
  const recentOrbitsRef = useRef<
    { anchor: DirectorVec3Tuple; angle: number }[]
  >([]);
  /** The pan's view of its subject (visible / gone / respawned), so
   *  transitions log once instead of the pan moving silently. */
  const panStateRef = useRef<string | null>(null);
  const panPendingRef = useRef<{ state: string; sinceSec: number } | null>(
    null,
  );

  const dollyPosRef = useRef(new Vector3());
  const dollyAimRef = useRef(new Vector3());
  const dollySeededRef = useRef(false);
  const dollyHeadingRef = useRef(0);
  /** Smoothed subject velocity for the dolly's feed-forward. */
  const dollyVelRef = useRef(new Vector3());

  /**
   * Commit a fixed-camera placement: bearing, height and standoff
   * scales, and the anchor the orbit maths reads. `travel` eases the
   * camera over (mid-shot corrections); without it the placement lands
   * on the next frame's write (shot-apply time, where the cut or the
   * shot-change travel machinery handles the motion). `paceSweep` (the
   * view change this placement implies, radians) stretches the flight
   * so a quick hop never reads as a whip.
   */
  const commitPlacement = (
    placement: {
      angle: number;
      heightScale: number;
      radiusScale: number;
    },
    anchor: DirectorVec3Tuple,
    options?: {
      travel?: { position: Vector3; quaternion: Quaternion };
      paceSweep?: number;
    },
  ) => {
    if (options?.travel) {
      if (options.paceSweep != null) {
        travelMinDurationRef.current =
          options.paceSweep / REANCHOR_MAX_SWEEP_RATE;
      }
      travelFromRef.current.copy(options.travel.position);
      travelFromQuatRef.current.copy(options.travel.quaternion);
      travelStateRef.current = "armed";
      travelArmedFramesRef.current = 0;
    }
    orbitAngleRef.current = placement.angle;
    heightScaleRef.current = placement.heightScale;
    radiusScaleRef.current = placement.radiusScale;
    centerOverrideRef.current = anchor;
  };

  /**
   * Fly rather than cut when the new shot's camera is nearby. Called
   * once per frame AFTER whatever owns this shot has written the camera
   * — that written pose is the destination, so this works for the
   * director's own fixed/dolly shots and for follow shots positioned by
   * StreamingController alike.
   */
  const applyTravel = (
    camera: { position: Vector3; quaternion: Quaternion },
    delta: number,
  ) => {
    if (travelStateRef.current === "armed") {
      // Decide once the destination is actually known. For the
      // director's own shots that is this very frame; for a follow shot
      // StreamingController only writes the new pose on the NEXT frame,
      // so an unchanged pose means "not known yet" and we keep waiting
      // rather than concluding there is nothing to travel.
      const distance = travelFromRef.current.distanceTo(camera.position);
      if (
        distance > TRANSITION_MIN_DISTANCE &&
        distance <= TRANSITION_MAX_DISTANCE
      ) {
        travelStateRef.current = "active";
        travelElapsedRef.current = 0;
        travelDurationRef.current = Math.min(
          TRANSITION_MAX_SEC,
          Math.max(
            TRANSITION_MIN_SEC,
            distance / TRANSITION_SPEED,
            travelMinDurationRef.current,
          ),
        );
        travelMinDurationRef.current = 0;
        log.info(
          "%s travel: flying %dm over %ss",
          demoClock(streamClock.time),
          Math.round(distance),
          travelDurationRef.current.toFixed(2),
        );
      } else if (
        distance > TRANSITION_MAX_DISTANCE ||
        ++travelArmedFramesRef.current > TRANSITION_ARM_FRAMES
      ) {
        // Too far to fly, or the pose never moved: cut.
        travelStateRef.current = "idle";
        if (distance > TRANSITION_MAX_DISTANCE) {
          log.info(
            "%s travel: cut (%dm is beyond flying range)",
            demoClock(streamClock.time),
            Math.round(distance),
          );
        }
      }
    }
    if (travelStateRef.current !== "active") return;
    _transitionTargetPos.copy(camera.position);
    _transitionTargetQuat.copy(camera.quaternion);
    travelElapsedRef.current += delta;
    const t = easeInOutCubic(
      Math.min(1, travelElapsedRef.current / travelDurationRef.current),
    );
    camera.position.lerpVectors(travelFromRef.current, _transitionTargetPos, t);
    camera.quaternion
      .copy(travelFromQuatRef.current)
      .slerp(_transitionTargetQuat, t);
    if (travelElapsedRef.current >= travelDurationRef.current) {
      travelStateRef.current = "idle";
    }
  };

  /**
   * Find a follow-shot orbit bearing that can actually see the subject:
   * sweep yaw offsets from `baseYaw`, requiring outward room AND a
   * verified sightline from the promised eye point. Null when every
   * bearing is walled. `_subjectPos` must hold the (lifted) subject.
   */
  const findClearFollowYaw = (
    baseYaw: number,
    pitch: number,
    wanted: number,
  ): { yaw: number; offset: number; room: number } | null => {
    for (const offset of VISIBILITY_YAW_OFFSETS) {
      const yaw = baseYaw + offset;
      orbitPullbackDir(yaw, pitch, _visCandidate);
      const room = clearStandoffWide(_subjectPos, _visCandidate, wanted);
      if (room <= 0) continue;
      // Verify the promised eye point looking back in: the outward cast
      // starts from a lifted origin that can escape a low roof and
      // report room a real camera would not have.
      if (
        subjectViewBlocked(
          _visNewAim.copy(_subjectPos).addScaledVector(_visCandidate, room),
          _subjectPos,
        )
      ) {
        continue;
      }
      return { yaw, offset, room };
    }
    return null;
  };

  /**
   * Two safety rails applied to whatever the current shot produced:
   * keep the camera above ground, and keep the subject actually
   * visible. Both are throttled — a full-scene raycast per frame is far
   * too costly — and both correct rather than merely detect.
   */
  const enforceCameraSanity = (
    camera: { position: Vector3; quaternion: Quaternion },
    shot: Shot,
    delta: number,
  ) => {
    // ── Never below the terrain ──
    // Three (x, y, z) is Torque (y, z, x), so the sampler takes the
    // camera's z as Torque x and its x as Torque y.
    const ground = groundHeightAt(camera.position.x, camera.position.z);
    if (ground != null && camera.position.y < ground + GROUND_MIN_CLEARANCE) {
      camera.position.y = ground + GROUND_MIN_CLEARANCE;
    }

    // ── Keep the subject in view ──
    const subject = shotSubjectOf(shot);
    if (!subject && shot.kind !== "fixedOrbit") return;
    // Follow shots are positioned by StreamingController, which is lazily
    // mounted and so can write the camera AFTER this clamp — correcting
    // its position here is not reliable. Steepen the orbit pitch instead,
    // which is an input StreamingController reads, so the pose it
    // computes is above ground in the first place.
    if (
      subject &&
      (shot.kind === "followFlag" || shot.kind === "followPlayer") &&
      keepFollowAboveGround(subject)
    ) {
      return;
    }
    visibilityTimerRef.current += delta;
    if (visibilityTimerRef.current < VISIBILITY_CHECK_SEC) return;
    visibilityTimerRef.current = 0;
    if (subject) {
      const group = resolveShotSubjectGroup(subject);
      if (!group) return;
      _subjectPos.copy(group.position);
      _subjectPos.y += ORBIT_LOOK_LIFT;
    } else if (shot.kind === "fixedOrbit") {
      // No named subject: the anchor IS the subject. A camera that
      // cannot see its own centre is staring at a roof or a hillside,
      // whatever the plan intended it to show.
      const anchorNow = centerOverrideRef.current ?? shot.center;
      _subjectPos.set(
        anchorNow[1],
        anchorNow[2] + ORBIT_LOOK_LIFT,
        anchorNow[0],
      );
    } else {
      return;
    }
    // Out of range counts as losing the subject just as much as a wall
    // does — but measured from the shot's ANCHOR, never from the camera:
    // a wide shot's camera is a full radius away from a perfectly
    // centred subject, and measuring from it made every big shot
    // instantly "out of range" and sent the camera chasing its own
    // framing. The bound also scales with the shot — a 110m overview is
    // allowed to hold a subject its own radius away.
    let strayed = false;
    if (shot.kind === "fixedOrbit") {
      const anchorNow = centerOverrideRef.current ?? shot.center;
      const fromAnchor = Math.hypot(
        _subjectPos.x - anchorNow[1],
        _subjectPos.z - anchorNow[0],
      );
      if (fromAnchor > Math.max(SUBJECT_MAX_RANGE, shot.radius)) {
        // Only a FLAG earns a re-anchor chase — it slides there
        // continuously and stays the story. A player this far out has
        // died and respawned: a different scene. Guard the anchor
        // instead of raycasting at a body across the map. And a flag
        // that JUMPED to its home stand didn't slide — it was returned
        // or capped, and warping the camera home after it is the most
        // anti-climactic move a broadcast can make: the story stays at
        // the scene (the aftermath shot owns what happens next).
        if (
          subject?.type === "flag" &&
          !flagAtHomeStand(subject.slot, _subjectPos)
        ) {
          strayed = true;
        } else {
          const anchorHold = centerOverrideRef.current ?? shot.center;
          _subjectPos.set(
            anchorHold[1],
            anchorHold[2] + ORBIT_LOOK_LIFT,
            anchorHold[0],
          );
        }
      }
    }
    if (!strayed && !subjectViewBlocked(camera.position, _subjectPos)) {
      visibilityStrikesRef.current = 0;
      return;
    }
    if (++visibilityStrikesRef.current < VISIBILITY_BLOCKED_STRIKES) return;
    visibilityStrikesRef.current = 0;
    // A correction is itself a camera move; a second one on its heels
    // reads as the camera spinning in confusion (dropped flags roll,
    // scrums shuffle). Hold what we have until the last one has settled.
    if (streamClock.time - lastCorrectionRef.current < REANCHOR_COOLDOWN_SEC) {
      return;
    }
    // And NO correction in the shot's final stretch — the cut is coming
    // anyway; a retarget seconds before it is a jump with no payoff.
    if (shot.endSec - streamClock.time < CORRECTION_MIN_REMAINING_SEC) {
      return;
    }
    lastCorrectionRef.current = streamClock.time;

    if (shot.kind === "fixedOrbit") {
      // Re-anchor around the SUBJECT (not the shot's stale centre) and
      // fly to the new spot rather than snapping. Three (x, y, z) →
      // Torque (z, x, y), undoing the look-lift added above.
      let anchor: DirectorVec3Tuple = [
        _subjectPos.z,
        _subjectPos.x,
        _subjectPos.y - ORBIT_LOOK_LIFT,
      ];
      // A dropped flag can clip into a hillside; anchoring the
      // correction on the buried point makes every placement garbage.
      anchor = surfaceLiftedAnchor(anchor) ?? anchor;
      const placement = chooseClearPlacement(
        anchor,
        shot.radius,
        shot.heightFactor ?? ORBIT_HEIGHT_FACTOR,
        orbitAngleRef.current,
        { minScale: shot.lookSubject ? 0 : STANDOFF_MIN_SCALE },
      );
      if (!placement.clear) {
        log.debug(
          "%s visibility: subject %s but no clear placement found",
          demoClock(streamClock.time),
          strayed ? "out of range" : "blocked",
        );
        return;
      }
      // Disruption budget: how far would the view swing, and how fast?
      const lift =
        (shot.heightFactor ?? ORBIT_HEIGHT_FACTOR) * placement.heightScale;
      const radius = shot.radius * placement.radiusScale;
      _visCandidate.set(
        _subjectPos.x + Math.cos(placement.angle) * radius,
        _subjectPos.y - ORBIT_LOOK_LIFT + radius * lift,
        _subjectPos.z + Math.sin(placement.angle) * radius,
      );
      _visForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      _visNewAim.copy(_subjectPos).sub(_visCandidate).normalize();
      const sweep = Math.acos(
        Math.max(-1, Math.min(1, _visForward.dot(_visNewAim))),
      );
      const remaining = shot.endSec - streamClock.time;
      if (
        (sweep > REANCHOR_MAX_SWEEP_RAD && budgetHoldsRef.current < 2) ||
        remaining < REANCHOR_MIN_REMAINING_SEC
      ) {
        // The one correction that is NEVER disruptive: keep the current
        // bearing and shorten the leash until the wall is behind the
        // camera instead of in front of it. Zero sweep — the lens keeps
        // pointing where it points, the camera just moves toward the
        // subject. Only when even that has no room does the frame stay
        // imperfect.
        const bearing = orbitBearingOf(
          camera.position,
          _subjectPos.x,
          _subjectPos.z,
        );
        const lift0 = shot.heightFactor ?? ORBIT_HEIGHT_FACTOR;
        const norm = Math.hypot(1, lift0);
        _visNewAim.set(
          Math.cos(bearing) / norm,
          lift0 / norm,
          Math.sin(bearing) / norm,
        );
        const desired = shot.radius * norm;
        const room = clearStandoffWide(_subjectPos, _visNewAim, desired);
        // (The final-stretch gate above already guarantees ≥2s remain.)
        if (room > 0) {
          log.info(
            "%s visibility: pulling in on current bearing to %dm (swing would be %d°)",
            demoClock(streamClock.time),
            Math.round(room),
            Math.round((sweep * 180) / Math.PI),
          );
          commitPlacement(
            {
              angle: bearing,
              heightScale: 1,
              radiusScale: Math.min(1, room / desired),
            },
            anchor,
            { travel: camera },
          );
          return;
        }
        budgetHoldsRef.current += 1;
        log.info(
          "%s visibility: holding imperfect frame — correction too disruptive (%d° sweep, %ss left)",
          demoClock(streamClock.time),
          Math.round((sweep * 180) / Math.PI),
          remaining.toFixed(1),
        );
        return;
      }
      budgetHoldsRef.current = 0;
      log.info(
        "%s visibility: %s — re-anchoring on subject (angle %d°, r×%s)",
        demoClock(streamClock.time),
        strayed ? "subject left the frame" : "subject behind geometry",
        Math.round(((((placement.angle * 180) / Math.PI) % 360) + 360) % 360),
        placement.radiusScale.toFixed(2),
      );
      // A quick hop must not read as a whip: paceSweep stretches the
      // flight so the view never turns faster than the sweep-rate cap.
      commitPlacement(placement, anchor, {
        travel: camera,
        paceSweep: sweep,
      });
      return;
    }

    if (shot.kind === "followFlag" || shot.kind === "followPlayer") {
      // Swing the orbit round the subject until the line is clear, and
      // where no bearing has room for the full standoff, pull in to what
      // does fit — a subject indoors has metres, not tens of metres. The
      // aim steering turns at its own rate, so this reads as the camera
      // repositioning rather than a cut.
      const state = streamPlaybackStore.getState();
      const wanted = shot.distance ?? state.orbitOverrideDistance;
      const clear = findClearFollowYaw(
        state.orbitOverrideYaw,
        state.orbitOverridePitch,
        wanted,
      );
      if (clear) {
        log.info(
          "%s visibility: follow subject blocked — swinging yaw %d°%s",
          demoClock(streamClock.time),
          Math.round((clear.offset * 180) / Math.PI),
          clear.room < wanted
            ? ` and pulling in to ${Math.round(clear.room)}m`
            : "",
        );
        visibilityYawRef.current = clear.yaw;
        visibilityDistanceRef.current = clear.room < wanted ? clear.room : null;
        return;
      }
      log.debug(
        "%s visibility: follow subject blocked on every bearing — holding",
        demoClock(streamClock.time),
      );
    }
  };

  /**
   * Everything that happens once at a shot boundary: log it, arm the
   * shot-to-shot travel, reset the per-shot correction state, hand the
   * camera to the right owner (applyShot), then do the geometry-aware
   * entry work — lifting a sweep until both ends can see, framing a
   * doorway from its walked crossings, and choosing/resuming a clear
   * fixedOrbit placement around the live subject.
   */
  const onShotChange = (
    shot: Shot,
    index: number,
    shots: readonly Shot[],
    t: number,
    fallbackCamera: Camera,
  ): void => {
    // A jump of more than one shot means a seek re-synced the plan.
    if (
      shotIndexRef.current >= 0 &&
      Math.abs(index - shotIndexRef.current) > 1
    ) {
      log.info(
        "%s seek: re-synced from shot #%d to #%d",
        demoClock(t),
        shotIndexRef.current + 1,
        index + 1,
      );
    }
    log.info("%s %s", demoClock(t), describeShot(shot, index, shots.length));
    shotIndexRef.current = index;
    appliedShotRef.current = shot;
    const leaving = cameraRegistry.perspective ?? fallbackCamera;
    travelFromRef.current.copy(leaving.position);
    travelFromQuatRef.current.copy(leaving.quaternion);
    travelStateRef.current = "armed";
    travelArmedFramesRef.current = 0;
    visibilityStrikesRef.current = 0;
    visibilityYawRef.current = null;
    visibilityDistanceRef.current = null;
    lastCorrectionRef.current = -Infinity;
    budgetHoldsRef.current = 0;
    panStateRef.current = null;
    travelMinDurationRef.current = 0;
    radiusScaleRef.current = 1;
    centerOverrideRef.current = null;
    applyShot(shot);
    dollySeededRef.current = false;
    if (shot.kind === "followFlag" || shot.kind === "followPlayer") {
      // Entry pre-clear: fixed shots already choose a placement that can
      // see their subject before the first frame — follow shots used to
      // open on the planned aim and only get swung clear by the periodic
      // check half a second later, a visible "position, then adjust".
      // Sweep for a clear bearing NOW, from the yaw the aim would
      // command, and open there instead.
      const subject = shotSubjectOf(shot);
      const group = subject ? resolveShotSubjectGroup(subject) : null;
      if (group) {
        _subjectPos.copy(group.position);
        _subjectPos.y += ORBIT_LOOK_LIFT;
        const playbackState = streamPlaybackStore.getState();
        const wanted = shot.distance ?? playbackState.orbitOverrideDistance;
        const pitch = shot.pitch ?? playbackState.orbitOverridePitch;
        let entryYaw = playbackState.orbitOverrideYaw;
        if (shot.aim?.mode === "hold") {
          entryYaw = shot.aim.yaw;
        } else if (shot.aim?.mode === "toward") {
          entryYaw = bearingYaw(
            [group.position.z, group.position.x, 0],
            shot.aim.target,
          );
        } else {
          const heading = subjectHeading(
            subject!.type === "flag"
              ? resolveFlagEntityId(subject!.slot)
              : findLivingEntityByTargetId(subject!.targetId),
          );
          if (heading != null) {
            entryYaw =
              shot.aim?.mode === "backward" ? heading + Math.PI : heading;
          }
        }
        const clear = findClearFollowYaw(entryYaw, pitch, wanted);
        if (clear && (clear.offset !== 0 || clear.room < wanted)) {
          log.info(
            "%s entry: planned bearing blocked — opening at %d°%s",
            demoClock(t),
            Math.round((clear.offset * 180) / Math.PI),
            clear.room < wanted
              ? ` and pulled in to ${Math.round(clear.room)}m`
              : "",
          );
          visibilityYawRef.current = clear.yaw;
          visibilityDistanceRef.current =
            clear.room < wanted ? clear.room : null;
          if (shot.transitionIn === "cut") {
            // A cut has no continuity to preserve: open ON the clear
            // bearing rather than swinging onto it in view.
            streamPlaybackStore.setState({
              orbitOverrideYaw: clear.yaw,
              ...(clear.room < wanted
                ? { orbitOverrideDistance: clear.room }
                : null),
            });
          }
        }
      }
    }
    if (shot.kind === "sweep") {
      // Find a height at which both ends of the pass can see what
      // they are pointed at.
      sweepLiftRef.current = 0;
      for (const lift of SWEEP_LIFT_STEPS) {
        _sweepFrom.set(shot.from[1], shot.from[2] + lift, shot.from[0]);
        _sweepTo.set(shot.target[1], shot.target[2], shot.target[0]);
        const startClear = !viewBlocked(_sweepFrom, _sweepTo);
        const endTarget = shot.targetTo ?? shot.target;
        _sweepFrom.set(shot.to[1], shot.to[2] + lift, shot.to[0]);
        _sweepTo.set(endTarget[1], endTarget[2], endTarget[0]);
        const endClear = !viewBlocked(_sweepFrom, _sweepTo);
        sweepLiftRef.current = lift;
        if (startClear && endClear) break;
      }
      if (sweepLiftRef.current > 0) {
        log.info(
          "%s sweep: lifted %dm so both ends of the pass can see",
          demoClock(t),
          sweepLiftRef.current,
        );
      }
    }
    let doorwayPlaced = false;
    if (shot.kind === "fixedOrbit" && shot.doorwayOf) {
      // A doorway watch. The definitive door signal is where players
      // actually WALKED: consecutive samples flipping between roofed
      // and open sky crossed a door between them (computed once per
      // demo and cached). The straight-ray fan from the hold and the
      // live players is the fallback for sparse data.
      const doors = doorwaysNear(shot.doorwayOf);
      const planned = shot.startAngle ?? 0;
      const height = shot.heightFactor ?? ORBIT_HEIGHT_FACTOR;
      const norm = Math.hypot(1, height);
      for (const door of doors) {
        // Camera on the OUTSIDE of the door, looking in at the mouth.
        const angle = Math.atan2(door.outward[0], door.outward[1]);
        _subjectPos.set(
          door.pos[1],
          door.pos[2] + ORBIT_LOOK_LIFT,
          door.pos[0],
        );
        _visCandidate.set(
          Math.cos(angle) / norm,
          height / norm,
          Math.sin(angle) / norm,
        );
        const room = clearStandoff(
          _subjectPos,
          _visCandidate,
          shot.radius * norm,
        );
        if (room <= 0) continue;
        commitPlacement(
          {
            angle,
            heightScale: 1,
            radiusScale: Math.min(1, room / (shot.radius * norm)),
          },
          door.pos,
        );
        doorwayPlaced = true;
        log.info(
          "%s doorway: %d player crossings mark the door — framing its mouth from outside (%dm back)",
          demoClock(t),
          door.crossings,
          Math.round(shot.radius * radiusScaleRef.current),
        );
        break;
      }
      if (!doorwayPlaced) {
        // Fallback: straight-ray fan from the hold and the players
        // around it.
        _subjectPos.set(
          shot.doorwayOf[1],
          shot.doorwayOf[2],
          shot.doorwayOf[0],
        );
        const origins = [
          _subjectPos.clone(),
          ...livingPlayerPositionsNear(_subjectPos, 40, 8),
        ];
        let opening: {
          origin: Vector3;
          angle: number;
          escape: number;
        } | null = null;
        let bestScore = -Infinity;
        for (const origin of origins) {
          for (const d of findOpeningsByRay(origin)) {
            const delta = Math.abs(
              ((d.angle - planned + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
            );
            const score = Math.min(d.escape, 30) * 2 - delta * 6;
            if (score > bestScore) {
              bestScore = score;
              opening = { origin, angle: d.angle, escape: d.escape };
            }
          }
        }
        if (opening) {
          commitPlacement(
            {
              angle: opening.angle,
              heightScale: 1,
              radiusScale:
                Math.max(
                  STANDOFF_MIN,
                  Math.min(shot.radius, opening.escape * 0.8),
                ) / shot.radius,
            },
            [opening.origin.z, opening.origin.x, opening.origin.y],
          );
          doorwayPlaced = true;
          log.info(
            "%s doorway: no walked crossings — ray fan found an opening at %d°",
            demoClock(t),
            Math.round(((((opening.angle * 180) / Math.PI) % 360) + 360) % 360),
          );
        } else {
          log.info(
            "%s doorway: no opening found — falling back to a clear framing",
            demoClock(t),
          );
        }
      }
    }
    if (shot.kind === "fixedOrbit" && !doorwayPlaced) {
      // Enter the orbit from the planned bearing (or the camera's
      // current one), then nudge it to an angle that can actually see
      // the subject rather than a hillside or a base wall.
      const camera = cameraRegistry.perspective ?? fallbackCamera;
      // If the shot's subject has already strayed from the planned
      // centre (a flag carried off between planning and now), anchor
      // on where it actually is from the first frame — otherwise the
      // shot opens on an empty anchor and only the visibility rail
      // drags it over a second later.
      let anchor = shot.center;
      // A centroid-derived anchor can land inside a hillside on slope
      // maps; a camera framing a buried point shows dirt, and every
      // correction around it digs deeper. Lift to the surface first.
      const lifted = surfaceLiftedAnchor(anchor);
      if (lifted) {
        anchor = lifted;
        centerOverrideRef.current = lifted;
        log.info(
          "%s apply: anchor was buried in the terrain — lifted %dm to the surface",
          demoClock(t),
          Math.round(lifted[2] - shot.center[2]),
        );
      }
      const subject = shot.lookSubject
        ? resolveShotSubjectGroup(shot.lookSubject)
        : null;
      if (subject) {
        _subjectPos.copy(subject.position);
        const strayed =
          Math.hypot(
            _subjectPos.x - shot.center[1],
            _subjectPos.z - shot.center[0],
          ) > SUBJECT_MAX_RANGE;
        if (strayed) {
          anchor = [_subjectPos.z, _subjectPos.x, _subjectPos.y];
          centerOverrideRef.current = anchor;
          log.info(
            "%s apply: subject already %dm from planned centre — anchoring on it",
            demoClock(t),
            Math.round(
              Math.hypot(
                _subjectPos.x - shot.center[1],
                _subjectPos.z - shot.center[0],
              ),
            ),
          );
        }
      }
      // Returning to (near) the same anchor resumes the previous
      // orbit's phase — a restarted rotation from the planned angle
      // reads as a broken record when the same stand is revisited.
      const resumed =
        recentOrbitsRef.current.find(
          (o) =>
            Math.hypot(o.anchor[0] - anchor[0], o.anchor[1] - anchor[1]) <= 25,
        )?.angle ?? null;
      if (resumed != null) {
        log.info("%s apply: resuming the earlier orbit phase", demoClock(t));
      }
      // Already IN the scene (the camera was just following the carrier
      // who dropped here): continuity beats composition — enter from
      // the bearing the viewer is already on rather than swinging to
      // the planned one. Distant cuts keep the composed angle; there is
      // nothing on screen to stay continuous with.
      const alreadyNear =
        Math.hypot(
          camera.position.x - anchor[1],
          camera.position.z - anchor[0],
        ) <= Math.max(60, shot.radius * 1.5);
      if (resumed == null && alreadyNear && shot.startAngle != null) {
        log.info(
          "%s apply: already at the scene — keeping the current bearing",
          demoClock(t),
        );
      }
      const planned =
        resumed ??
        (alreadyNear || shot.startAngle == null
          ? orbitBearingOf(camera.position, anchor[1], anchor[0])
          : shot.startAngle);
      const placement = chooseClearPlacement(
        anchor,
        shot.radius,
        shot.heightFactor ?? ORBIT_HEIGHT_FACTOR,
        planned,
        { minScale: shot.lookSubject ? 0 : STANDOFF_MIN_SCALE },
      );
      orbitAngleRef.current = placement.angle;
      heightScaleRef.current = placement.heightScale;
      radiusScaleRef.current = placement.radiusScale;
    }
  };

  /** Per-kind camera drives, one per shot mechanism — each owns its
   *  whole frame: position/aim writes, then travel easing and the
   *  sanity rails. Split from the frame loop so the loop reads as
   *  dispatch. */
  const driveFixedOrbit = (
    shot: Extract<Shot, { kind: "fixedOrbit" }>,
    t: number,
    isPlaying: boolean,
    demoDelta: number,
    fallbackCamera: Camera,
  ): void => {
    // Direct camera write: freeFly mode means nothing else touches the
    // camera (inputs are unmounted). Torque [x,y,z] → Three (y,z,x).
    if (isPlaying) {
      orbitAngleRef.current += (shot.angularSpeed ?? 0.1) * demoDelta;
    }
    const camera = cameraRegistry.perspective ?? fallbackCamera;
    const anchor = centerOverrideRef.current ?? shot.center;
    // Remember this orbit's phase, replacing an earlier entry for the
    // same spot; keep only a handful so stale anchors age out.
    {
      const ring = recentOrbitsRef.current;
      const existing = ring.findIndex(
        (o) =>
          Math.hypot(o.anchor[0] - anchor[0], o.anchor[1] - anchor[1]) <= 25,
      );
      const entry = { anchor, angle: orbitAngleRef.current };
      if (existing >= 0) ring[existing] = entry;
      else {
        ring.push(entry);
        if (ring.length > 4) ring.shift();
      }
    }
    const cx = anchor[1];
    const cy = anchor[2];
    const cz = anchor[0];
    const radius = shot.radius * radiusScaleRef.current;
    const height =
      radius *
      (shot.heightFactor ?? ORBIT_HEIGHT_FACTOR) *
      heightScaleRef.current;
    camera.position.set(
      cx + Math.cos(orbitAngleRef.current) * radius,
      cy + height,
      cz + Math.sin(orbitAngleRef.current) * radius,
    );
    // Locked-off but panning: aim at the subject's live position when
    // the shot names one (a dropped flag slides after landing), eased
    // so the pan is gentle. Otherwise just look at the center point.
    if (shot.lookSubject) {
      const subjectGroup = resolveShotSubjectGroup(shot.lookSubject);
      // Coverage gate for PLAYER subjects: a player only leaves a
      // fixed shot's coverage by dying and respawning — the body that
      // reappears across the map is a different scene, not this
      // shot's subject moving. (Flags slide continuously, and the
      // strayed rail re-anchors on them — logged — so they stay.)
      let state: "visible" | "gone" | "respawned elsewhere" | "returned home" =
        "visible";
      if (!subjectGroup) {
        state = "gone";
      } else if (
        Math.hypot(subjectGroup.position.x - cx, subjectGroup.position.z - cz) >
        Math.max(SUBJECT_MAX_RANGE, shot.radius)
      ) {
        if (shot.lookSubject.type === "player") {
          state = "respawned elsewhere";
        } else if (
          flagAtHomeStand(shot.lookSubject.slot, subjectGroup.position)
        ) {
          state = "returned home";
        }
      }
      // A player's death ENDS this shot's story: the body that comes
      // back is a new scene, wherever it spawns — never re-acquire.
      // (A flag that reappears is still the flag.)
      if (
        shot.lookSubject.type === "player" &&
        state === "visible" &&
        (panStateRef.current === "gone" ||
          panStateRef.current === "respawned elsewhere")
      ) {
        state = panStateRef.current as typeof state;
      }
      // Hysteresis: the flag ghost flickers around a capture (hidden,
      // visible, teleported home within a second) and reacting to each
      // flicker swings the aim mid-ceremony. A new state must PERSIST
      // briefly before the pan acts on it; holds lose nothing by
      // committing late, and tracking resumes a beat later at worst.
      if (state === panStateRef.current) {
        panPendingRef.current = null;
      } else if (panStateRef.current == null) {
        panStateRef.current = state;
      } else if (panPendingRef.current?.state !== state) {
        panPendingRef.current = { state, sinceSec: t };
      } else if (t - panPendingRef.current.sinceSec >= PAN_STATE_COMMIT_SEC) {
        log.info(
          "%s pan: subject %s — %s",
          demoClock(t),
          state,
          state === "visible" ? "tracking again" : "holding the last framing",
        );
        panStateRef.current = state;
        panPendingRef.current = null;
      }
      const onSubject = panStateRef.current === "visible" && subjectGroup;
      if (!dollySeededRef.current) {
        dollySeededRef.current = true;
        // Open the shot already framing its subject. Seeding the pan
        // at the shot's centre made every shot whose subject sat off-
        // centre OPEN with a slow whip-pan across empty ground — a
        // camera move that means nothing. The damped pan below is for
        // FOLLOWING the subject's motion, not for correcting the
        // opening frame.
        if (onSubject) {
          dollyAimRef.current.copy(subjectGroup.position);
          dollyAimRef.current.y += ORBIT_LOOK_LIFT;
        } else {
          dollyAimRef.current.set(cx, cy + ORBIT_LOOK_LIFT, cz);
        }
      }
      // ALWAYS through the damped point — a subject dying mid-shot
      // used to hard-snap the aim back to the centre in one frame,
      // then swing it to their respawn when a new body resolved.
      // And when the subject is LOST, the aim HOLDS where it last saw
      // them: swinging back to the (now empty) anchor is a camera
      // move with no subject, the "mysterious rotate-back".
      if (onSubject) {
        _staticLook.copy(subjectGroup.position);
        _staticLook.y += ORBIT_LOOK_LIFT;
        dollyAimRef.current.lerp(
          _staticLook,
          1 - Math.exp(-STATIC_PAN_DAMPING * demoDelta),
        );
      }
      camera.lookAt(dollyAimRef.current);
    } else {
      camera.lookAt(cx, cy + ORBIT_LOOK_LIFT, cz);
    }
    applyTravel(camera, demoDelta);
    enforceCameraSanity(camera, shot, demoDelta);
    return;
  };

  const driveSweep = (
    shot: Extract<Shot, { kind: "sweep" }>,
    t: number,
    isPlaying: boolean,
    demoDelta: number,
    fallbackCamera: Camera,
  ): void => {
    // Roster-lineup flyby: glide along a fixed path looking at a fixed
    // point. Eased at both ends so it starts and stops like a crane
    // move rather than a slide.
    const camera = cameraRegistry.perspective ?? fallbackCamera;
    const span = Math.max(0.001, shot.endSec - shot.startSec);
    const progress = easeInHold(
      Math.min(1, Math.max(0, (t - shot.startSec) / span)),
    );
    camera.position.set(
      shot.from[1] + (shot.to[1] - shot.from[1]) * progress,
      shot.from[2] +
        (shot.to[2] - shot.from[2]) * progress +
        sweepLiftRef.current,
      shot.from[0] + (shot.to[0] - shot.from[0]) * progress,
    );
    // The look-at pans too when the shot names an end target, so a
    // pass across a line of faces tracks along it instead of swinging
    // past a fixed point.
    const aimTo = shot.targetTo ?? shot.target;
    camera.lookAt(
      shot.target[1] + (aimTo[1] - shot.target[1]) * progress,
      shot.target[2] + (aimTo[2] - shot.target[2]) * progress,
      shot.target[0] + (aimTo[0] - shot.target[0]) * progress,
    );
    applyTravel(camera, demoDelta);
    enforceCameraSanity(camera, shot, demoDelta);
    return;
  };

  const driveDolly = (
    shot: Extract<Shot, { kind: "dolly" }>,
    t: number,
    isPlaying: boolean,
    demoDelta: number,
    fallbackCamera: Camera,
  ): void => {
    // Film-style flying camera: damped pursuit of a trailing
    // three-quarter offset off the subject's path, aim eased onto the
    // subject. Direct camera writes in freeFly, like fixedOrbit.
    const camera = cameraRegistry.perspective ?? fallbackCamera;
    if (!dollySeededRef.current) {
      dollySeededRef.current = true;
      dollyPosRef.current.copy(camera.position);
      dollyVelRef.current.set(0, 0, 0);
      const entryHeading = shot.subject
        ? subjectHeading(
            shot.subject.type === "flag"
              ? resolveFlagEntityId(shot.subject.slot)
              : findLivingEntityByTargetId(shot.subject.targetId),
          )
        : null;
      if (entryHeading != null) dollyHeadingRef.current = entryHeading;
      camera.getWorldDirection(_dollyDesired);
      dollyAimRef.current
        .copy(camera.position)
        .addScaledVector(_dollyDesired, 20);
    }
    const entityId =
      shot.subject.type === "flag"
        ? resolveFlagEntityId(shot.subject.slot)
        : findLivingEntityByTargetId(shot.subject.targetId);
    const group = entityId ? resolveSubjectGroup(entityId) : null;
    if (group) {
      const heading = subjectHeading(entityId);
      if (heading != null) {
        // Slew rather than snap: the raw heading flicks with every
        // jink, and at offset distance each flick teleports the
        // desired camera point sideways — the "jumpy" in a jumpy
        // tracking shot.
        dollyHeadingRef.current = approachAngle(
          dollyHeadingRef.current,
          heading,
          DOLLY_HEADING_RATE * demoDelta,
        );
      }
      _dollySubject.copy(group.position);
      _dollySubject.y += DOLLY_LOOK_LIFT;
      const distance = shot.distance ?? DOLLY_DEFAULT_DISTANCE;
      if (shot.awayFrom) {
        // Profile framing: ride outside the subject relative to the
        // map's midpoint, so the lens looks INWARD across them at the
        // space between the bases — a trailing camera on a cross-map
        // run mostly stares at the empty map edge beyond the carrier.
        _dollyOut
          .set(
            _dollySubject.x - shot.awayFrom[1],
            0,
            _dollySubject.z - shot.awayFrom[0],
          )
          .normalize();
        if (_dollyOut.lengthSq() < 0.5) _dollyOut.set(1, 0, 0);
        _dollyDesired.set(
          _dollySubject.x + _dollyOut.x * distance,
          _dollySubject.y + (shot.height ?? DOLLY_DEFAULT_HEIGHT),
          _dollySubject.z + _dollyOut.z * distance,
        );
      } else {
        const angle =
          dollyHeadingRef.current +
          Math.PI +
          (shot.side ?? 1) * DOLLY_SIDE_ANGLE;
        _dollyDesired.set(
          _dollySubject.x + Math.cos(angle) * distance,
          _dollySubject.y + (shot.height ?? DOLLY_DEFAULT_HEIGHT),
          _dollySubject.z + Math.sin(angle) * distance,
        );
      }
      // Velocity feed-forward: a first-order follow lags by v/k, which
      // at ski speeds (~70 u/s) would trail tens of metres behind and
      // shrink the subject to a dot. Leading the target by exactly
      // v/k cancels that, so the camera holds its intended framing
      // while keeping the eased, hand-flown feel.
      if (entityId && subjectVelocity(entityId, _dollyVelocity)) {
        dollyVelRef.current.lerp(
          _dollyVelocity,
          1 - Math.exp(-DOLLY_VELOCITY_SMOOTHING * demoDelta),
        );
      } else {
        dollyVelRef.current.multiplyScalar(
          Math.exp(-DOLLY_VELOCITY_SMOOTHING * demoDelta),
        );
      }
      _dollyDesired.addScaledVector(dollyVelRef.current, 1 / DOLLY_DAMPING);
      dollyPosRef.current.lerp(
        _dollyDesired,
        1 - Math.exp(-DOLLY_DAMPING * demoDelta),
      );
      // Same feed-forward on the aim point, so the subject stays
      // framed instead of drifting ahead of a lagging look-at.
      _dollySubject.addScaledVector(dollyVelRef.current, 1 / DOLLY_AIM_DAMPING);
      dollyAimRef.current.lerp(
        _dollySubject,
        1 - Math.exp(-DOLLY_AIM_DAMPING * demoDelta),
      );
    }
    // Subject missing (between bodies / not ghosted): the camera
    // glides to rest where it was, still watching the last position.
    camera.position.copy(dollyPosRef.current);
    camera.lookAt(dollyAimRef.current);
    applyTravel(camera, demoDelta);
    enforceCameraSanity(camera, shot, demoDelta);
    return;
  };

  const driveFollow = (
    shot: Extract<Shot, { kind: "followFlag" | "followPlayer" }>,
    t: number,
    isPlaying: boolean,
    demoDelta: number,
    fallbackCamera: Camera,
  ): void => {
    // Follow shots: keep the selection state converged on the shot's
    // subject (the flag may not be ghosted yet; the player may be
    // between bodies) — the frame this resolves, the shot takes hold.
    const playbackState = streamPlaybackStore.getState();
    if (shot.kind === "followFlag") {
      if (playbackState.followFlagSlot !== shot.slot) {
        followFlag(shot.slot);
      }
    } else if (
      playbackState.followTargetId !== shot.targetId ||
      playbackState.followEntityId == null
    ) {
      const entityId = findLivingEntityByTargetId(shot.targetId);
      if (entityId) enterWatchFollow(entityId);
    }

    // Ease framing parameters toward the shot's targets (continuous
    // transitions glide; cuts were snapped in applyShot), and steer the
    // orbit yaw with the shot's aim: behind the subject looking forward,
    // ahead looking back at pursuers, a held world bearing, or (aimless
    // shots) a slow broadcast drift.
    const updates: Partial<{
      orbitOverrideDistance: number;
      orbitOverridePitch: number;
      orbitOverrideYaw: number;
    }> = {};
    const ease = Math.min(1, demoDelta * PARAM_EASE_RATE);
    // A standoff the visibility check found room for outranks the shot's
    // own distance: seeing the subject beats framing intent.
    const wantDistance = visibilityDistanceRef.current ?? shot.distance;
    if (wantDistance != null) {
      const diff = wantDistance - playbackState.orbitOverrideDistance;
      if (Math.abs(diff) > 0.05) {
        updates.orbitOverrideDistance =
          playbackState.orbitOverrideDistance + diff * ease;
      }
    }
    if (shot.pitch != null) {
      const diff = shot.pitch - playbackState.orbitOverridePitch;
      if (Math.abs(diff) > 0.005) {
        updates.orbitOverridePitch =
          playbackState.orbitOverridePitch + diff * ease;
      }
    }
    if (isPlaying) {
      const aim = shot.aim;
      // A yaw found by the visibility check outranks the shot's own aim
      // for the REST of the shot — seeing the subject beats framing
      // intent. Forgetting it on arrival let a held aim drag the camera
      // straight back into the wall it had just escaped, with the
      // correction cooldown then locking in the stare.
      let targetYaw: number | null = visibilityYawRef.current;
      if (targetYaw != null) {
        // Keep the corrected bearing; later checks may replace it.
      } else if (aim?.mode === "hold") {
        targetYaw = aim.yaw;
      } else if (aim?.mode === "toward") {
        // Look across the subject at a world point (their destination
        // or the crowd). Near the target the bearing degenerates, so
        // hold the last yaw rather than spinning through it.
        const group = playbackState.followEntityId
          ? resolveSubjectGroup(playbackState.followEntityId)
          : null;
        if (group) {
          // group.position is Three-space: x = Torque y, z = Torque x.
          const dx = aim.target[0] - group.position.z;
          const dy = aim.target[1] - group.position.x;
          if (Math.hypot(dx, dy) >= AIM_TOWARD_MIN_RANGE) {
            targetYaw = bearingYaw(
              [group.position.z, group.position.x, 0],
              aim.target,
            );
          }
        }
      } else if (aim?.mode === "forward" || aim?.mode === "backward") {
        const heading = subjectHeading(playbackState.followEntityId);
        if (heading != null) {
          targetYaw = aim.mode === "forward" ? heading : heading + Math.PI;
        }
      }
      updates.orbitOverrideYaw =
        targetYaw != null
          ? approachAngle(
              playbackState.orbitOverrideYaw,
              targetYaw,
              AIM_TURN_RATE * demoDelta,
            )
          : playbackState.orbitOverrideYaw + FOLLOW_YAW_DRIFT * demoDelta;
    }
    if (Object.keys(updates).length > 0) {
      streamPlaybackStore.setState(updates);
    }
    // Follow shots are positioned by StreamingController; blending on
    // top of its write eases the entry into them too.
    const followCamera = cameraRegistry.perspective ?? fallbackCamera;
    applyTravel(followCamera, demoDelta);
    enforceCameraSanity(followCamera, shot, demoDelta);
  };

  useInputAction("directorInterrupt", exitDirector);
  useInputAction("directorInterruptClick", exitDirector);

  useFrame((state, delta) => {
    const { status, plan } = demoDirectorStore.getState();
    if (status !== "playing" || !plan || plan.shots.length === 0) {
      shotIndexRef.current = -1;
      appliedShotRef.current = null;
      return;
    }

    // Drag/touch can't fire one-shot input actions — poll their state.
    const actions = inputControlsStore.getState().actions;
    const drag = actions.directorInterruptDrag as DragState | undefined;
    const touch = actions.directorInterruptTouch as TouchState | undefined;
    if (drag?.dragging || touch?.touching) {
      exitDirector();
      return;
    }

    const t = streamClock.time;
    const shots = plan.shots;
    let index = shotIndexRef.current;
    if (index < 0 || !shotContains(shots[index], t)) {
      // Normal advance hits the next shot; anything else is a seek.
      index =
        index >= 0 &&
        index + 1 < shots.length &&
        shotContains(shots[index + 1], t)
          ? index + 1
          : findShotIndex(shots, t);
    }
    if (index < 0) {
      // Past the plan's end: hand back control, re-armed for a replay.
      exitDirector();
      return;
    }
    const shot = shots[index];
    if (shotIndexRef.current !== index || appliedShotRef.current !== shot) {
      onShotChange(shot, index, shots, t, state.camera);
    }

    // ALL camera motion runs on the demo clock, not wall time: paused
    // playback freezes the camera entirely (a rotating orbit must not
    // keep rotating over a frozen world), and at 2x the camera moves
    // twice as fast to stay in step with it.
    const playback = engineStore.getState().playback;
    const isPlaying = playback.status === "playing";
    const demoDelta = isPlaying ? delta * playback.rate : 0;

    if (shot.kind === "fixedOrbit") {
      driveFixedOrbit(shot, t, isPlaying, demoDelta, state.camera);
      return;
    }
    if (shot.kind === "sweep") {
      driveSweep(shot, t, isPlaying, demoDelta, state.camera);
      return;
    }
    if (shot.kind === "dolly") {
      driveDolly(shot, t, isPlaying, demoDelta, state.camera);
      return;
    }
    driveFollow(shot, t, isPlaying, demoDelta, state.camera);
  });

  return null;
}

function applyShot(shot: Shot): void {
  if (
    shot.kind === "fixedOrbit" ||
    shot.kind === "dolly" ||
    shot.kind === "sweep"
  ) {
    // Free-fly = nothing else drives the camera; DirectorController
    // writes it directly.
    exitToFreeFly();
    return;
  }
  if (shot.kind === "followFlag") {
    followFlag(shot.slot);
  } else {
    const entityId = findLivingEntityByTargetId(shot.targetId);
    if (entityId) enterWatchFollow(entityId);
  }
  if (shot.transitionIn === "cut") {
    streamPlaybackStore.setState({
      ...(shot.distance != null
        ? { orbitOverrideDistance: shot.distance }
        : null),
      ...(shot.pitch != null ? { orbitOverridePitch: shot.pitch } : null),
      // A fixed-bearing shot starts on its bearing — a fresh cut has no
      // continuity to preserve, so don't swing into it.
      ...(shot.aim?.mode === "hold"
        ? { orbitOverrideYaw: shot.aim.yaw }
        : null),
    });
  }
}
