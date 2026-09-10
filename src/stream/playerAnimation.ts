/**
 * Movement animation selection logic replicating Torque's
 * Player::pickActionAnimation() (Tribes2.exe FUN_005d6210).
 *
 * The server does NOT transmit table animation indices (0-7) over the
 * network. Each client independently derives the movement animation from
 * the ghost's velocity, body rotation, and state flags (mFalling, jetting).
 */

/** Minimum velocity dot product to count as intentional movement. */
const MOVE_THRESHOLD = 0.1;

/**
 * Horizontal speed above which the player cannot be running on the ground.
 * In the engine, grounded players are speed-capped by PlayerData::maxForwardSpeed
 * (light=15, medium=12, heavy=7). We use 20 to provide margin for brief
 * overshoots from slopes, momentum, and framerate-dependent speed variations.
 */
const MAX_GROUND_SPEED = 20;

export interface MoveAnimationResult {
  /** Engine alias name (e.g. "root", "run", "back", "side", "fall", "jet"). */
  animation: string;
  /** 1 for forward playback, -1 for reversed (right strafe). */
  timeScale: number;
}

/**
 * Extract body yaw (Torque rotationZ) from a Three.js quaternion produced by
 * `playerYawToQuaternion()`. That function builds a Y-axis rotation:
 *   qy = sin(-rotZ / 2), qw = cos(-rotZ / 2)
 * So: rotZ = -2 * atan2(qy, qw)
 */
function quaternionToBodyYaw(q: [number, number, number, number]): number {
  return -2 * Math.atan2(q[1], q[3]);
}

/**
 * Pick the movement animation for a player based on their velocity, body
 * orientation, and movement state flags.
 *
 * Replicates the Tribes2.exe binary (build 25034) pickActionAnimation at
 * 0x005d6210. The engine checks in order:
 *   1. mFalling → FallAnim
 *   2. contactTimer >= 30 (airborne) → jetting ? JetAnim : RootAnim
 *   3. contactTimer < 30 (on ground) → velocity-based (run/back/side/root)
 *
 * We don't have contactTimer directly, so we approximate the airborne check
 * using two heuristics:
 *   - Significant vertical velocity (|vz| > 2) implies not on the ground.
 *   - Horizontal speed exceeding the max ground running speed implies the
 *     player is skiing or otherwise airborne, since the engine caps grounded
 *     movement speed at maxForwardSpeed.
 */
export function pickMoveAnimation(
  velocity: [number, number, number] | undefined,
  rotation: [number, number, number, number],
  falling?: boolean,
  jetting?: boolean,
): MoveAnimationResult {
  // 1. Falling overrides everything.
  if (falling) {
    return { animation: "fall", timeScale: 1 };
  }

  if (!velocity) {
    return { animation: "root", timeScale: 1 };
  }

  const [vx, vy, vz] = velocity;

  // 2. Airborne detection (approximates contactTimer >= 30).
  // The engine uses contactTimer to distinguish grounded from airborne.
  // We approximate this with two checks:
  //   a) Vertical velocity indicates the player left the ground.
  //   b) Horizontal speed exceeds the ground movement cap — the player must
  //      be skiing/airborne since the engine limits grounded speed.
  const horizontalSpeedSq = vx * vx + vy * vy;
  const airborne =
    Math.abs(vz) > 2 || horizontalSpeedSq > MAX_GROUND_SPEED * MAX_GROUND_SPEED;

  if (airborne) {
    // Tribes2.exe checks mJetting here: jetting → JetAnim, else → RootAnim.
    if (jetting) {
      return { animation: "jet", timeScale: 1 };
    }
    return { animation: "root", timeScale: 1 };
  }

  // 3. On ground: convert world velocity to player object space using body yaw.
  // mWorldToObj.mulV(mVelocity) with a pure Z-axis rotation:
  //   localX = vx*cos(rotZ) + vy*sin(rotZ)
  //   localY = -vx*sin(rotZ) + vy*cos(rotZ)
  const yaw = quaternionToBodyYaw(rotation);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const localX = vx * cosY + vy * sinY;
  const localY = -vx * sinY + vy * cosY;

  // Dot products against animation direction vectors:
  //   run  dir = (0, 1, 0) → dot = localY
  //   back dir = (0,-1, 0) → dot = -localY
  //   side dir = (-1,0, 0) → dot = -localX (left), +localX (right reversed)
  const forwardDot = localY;
  const backDot = -localY;
  const leftDot = -localX;
  const rightDot = localX;

  const maxDot = Math.max(forwardDot, backDot, leftDot, rightDot);
  if (maxDot < MOVE_THRESHOLD) {
    return { animation: "root", timeScale: 1 };
  }

  if (maxDot === forwardDot) {
    return { animation: "run", timeScale: 1 };
  }
  if (maxDot === backDot) {
    return { animation: "back", timeScale: 1 };
  }
  if (maxDot === leftDot) {
    return { animation: "side", timeScale: 1 };
  }
  // Right strafe: same Side animation, reversed.
  return { animation: "side", timeScale: -1 };
}

/** Table actions (root, run, back, side, fall, jet, jump, land) occupy
 *  indices 0-7 of the engine's action list; anything above is a
 *  non-table action sent over the wire (deaths, cels, the PDA idle). */
export const NUM_TABLE_ACTION_ANIMS = 8;

/** The action animation the renderer has started, or none. */
export interface ActionAnimState {
  /** Action index and the ActionMask update it came from. */
  index: number | null;
  seq: number | null;
  /** The clip has finished and movement animation has resumed (or the
   *  action was already over when it arrived). */
  ended: boolean;
}

export const NO_ACTION_ANIM: ActionAnimState = {
  index: null,
  seq: null,
  ended: true,
};

export type ActionAnimCommand =
  /** Play this action clip from normalized `position` (1 = its end). */
  | { kind: "start"; index: number; position: number }
  /** The clip finished and does not hold: back to movement animation. */
  | { kind: "revert"; index: number }
  /** The clip finished and holds its last frame. */
  | { kind: "hold"; index: number }
  | { kind: "none" };

/**
 * What to do with the action animation this frame.
 *
 * Replicates the client half of Tribes2.exe's action thread update
 * (FUN_005d5bc0): a wired action plays to its end, and unless it was
 * sent hold-at-end the client then picks its own movement animation
 * again — the server never transmits table actions, so no packet ever
 * says "the PDA pose is over". A renderer that waited for one left the
 * player frozen in that pose for the rest of their life, running and
 * aiming with it. Keyed on the update counter as well as the index, so
 * the same action sent again (the PDA opened twice) restarts.
 */
export function stepActionAnim(
  state: ActionAnimState,
  kf: {
    actionAnim?: number;
    actionSeq?: number;
    actionAtEnd?: boolean;
    actionHoldAtEnd?: boolean;
  },
  /** The started clip has run to its end. */
  clipFinished = false,
  /** Where the server's thread is by now (actionStartPosition). */
  startPos = 0,
  /**
   * Mounted in a vehicle: pickActionAnimation (FUN_005d6210) then only
   * swaps a table action for root and leaves a finished wired action
   * parked on its last frame, so a seat pose holds without holdAtEnd.
   */
  mounted = false,
): { state: ActionAnimState; command: ActionAnimCommand } {
  const index = kf.actionAnim;
  const seq = kf.actionSeq ?? 0;
  const nonTable = index != null && index >= NUM_TABLE_ACTION_ANIMS;
  const holds = !!kf.actionHoldAtEnd || mounted;
  if (!nonTable) {
    // Cleared (an unmount reset): stop whatever was playing.
    if (state.index != null && !state.ended) {
      return {
        state: NO_ACTION_ANIM,
        command: { kind: "revert", index: state.index },
      };
    }
    return { state: NO_ACTION_ANIM, command: { kind: "none" } };
  }
  if (state.index !== index || state.seq !== seq) {
    // A new action. One the server already reports finished — or whose
    // clip would have run out by now — and that does not hold, is over
    // before it starts.
    const over = kf.actionAtEnd || startPos >= 1;
    if (over && !holds) {
      const stopping = state.index != null && !state.ended;
      return {
        state: { index, seq, ended: true },
        command: stopping
          ? { kind: "revert", index: state.index! }
          : { kind: "none" },
      };
    }
    return {
      state: { index, seq, ended: false },
      command: { kind: "start", index, position: over ? 1 : startPos },
    };
  }
  if (!state.ended && clipFinished) {
    if (holds) {
      return { state, command: { kind: "hold", index } };
    }
    return {
      state: { ...state, ended: true },
      command: { kind: "revert", index },
    };
  }
  return { state, command: { kind: "none" } };
}

/**
 * Where a wired action's clip stands at `nowSec`: the position the
 * server packed (its thread's, when the update was not at the end) plus
 * what has elapsed since the update, as the engine's own thread would
 * have advanced. Player::unpackUpdate seats a scope-in ghost's action
 * at that position; a model that starts late (a seek, a remount) must
 * not replay the clip from its start.
 */
export function actionStartPosition(
  kf: { actionAnimPos?: number; actionTimeSec?: number },
  nowSec: number,
  clipDurationSec: number,
): number {
  const packed = kf.actionAnimPos ?? 0;
  if (kf.actionTimeSec == null || !(clipDurationSec > 0)) return packed;
  const elapsed = Math.max(0, nowSec - kf.actionTimeSec);
  return Math.min(1, packed + elapsed / clipDurationSec);
}

export interface PlayerPose {
  name: string;
  position: number;
  weight: number;
}

/** Sample the body's action and its transition from stream time. Loading a
 * model late must not start a new death, taunt, seated pose or run cycle. */
export function samplePlayerPose(
  move: import("./clientAnimation").MoveAnimationTimeline,
  wired: {
    actionAnim?: number;
    actionAnimPos?: number;
    actionTimeSec?: number;
    actionAtEnd?: boolean;
    actionHoldAtEnd?: boolean;
    damageState?: number;
  },
  mounted: boolean,
  now: number,
  transitionDuration: number,
  actionName: (index: number) => string | undefined,
  clipInfo: (name: string) => { duration: number; cyclic: boolean } | undefined,
): PlayerPose[] {
  const movementPose = (
    m: MoveAnimationResult & { timeSec: number },
    start = m.timeSec,
  ): PlayerPose => {
    const info = clipInfo(m.animation);
    const elapsed =
      info && info.duration > 0
        ? (Math.max(0, now - start) * m.timeScale) / info.duration
        : 0;
    return {
      name: m.animation,
      position: info?.cyclic
        ? ((elapsed % 1) + 1) % 1
        : Math.max(0, Math.min(1, elapsed)),
      weight: 1,
    };
  };
  const name =
    wired.actionAnim != null &&
    (wired.actionAnim >= NUM_TABLE_ACTION_ANIMS ||
      (wired.damageState ?? 0) >= 1)
      ? actionName(wired.actionAnim)
      : undefined;
  const info = name ? clipInfo(name) : undefined;
  const position = wired.actionAtEnd
    ? 1
    : actionStartPosition(wired, now, info?.duration ?? 0);
  const actionStart =
    (wired.actionTimeSec ?? now) -
    (wired.actionAnimPos ?? 0) * (info?.duration ?? 0);
  const actionEnd = actionStart + (info?.duration ?? 0);
  const holds =
    wired.actionHoldAtEnd || mounted || (wired.damageState ?? 0) >= 1;
  let current: PlayerPose, previous: PlayerPose | undefined, changedAt: number;
  if (name && info && (position < 1 || holds)) {
    current = { name, position, weight: 1 };
    previous = movementPose(move);
    changedAt = wired.actionAtEnd ? -Infinity : actionStart;
  } else {
    const start = info ? Math.max(move.timeSec, actionEnd) : move.timeSec;
    current = movementPose(move, start);
    changedAt = start;
    previous =
      info && actionEnd >= move.timeSec
        ? { name: name!, position: 1, weight: 1 }
        : move.previous
          ? movementPose(move.previous)
          : undefined;
  }
  const weight =
    transitionDuration > 0
      ? Math.max(0, Math.min(1, (now - changedAt) / transitionDuration))
      : 1;
  if (!previous || previous.name === current.name || weight >= 1)
    return [current];
  current.weight = weight;
  previous.weight = 1 - weight;
  return [current, previous];
}
