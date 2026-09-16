/**
 * Movement animation selection based on Torque's
 * Player::pickActionAnimation() (Tribes2.exe FUN_005d6210).
 *
 * The server does NOT transmit table animation indices (0-7) over the
 * network. Each client independently derives the movement animation from
 * the ghost's velocity, body rotation, and state flags (mFalling, jetting).
 */

/** Minimum velocity dot product to count as intentional movement. */
const MOVE_THRESHOLD = 0.1;

export interface MoveAnimationResult {
  /** Engine alias name (e.g. "root", "run", "back", "side", "fall", "jet"). */
  animation: string;
  /** 1 for forward playback, -1 for reversed (right strafe). */
  timeScale: number;
}

/**
 * Pick the movement animation for a player based on their velocity, body
 * orientation, and movement state flags.
 *
 * Tribes2.exe (build 25034) pickActionAnimation at 0x005d6210 checks in order:
 *   1. mFalling → FallAnim
 *   2. contactTimer >= 30 (airborne) → jetting ? JetAnim : RootAnim
 *   3. contactTimer < 30 (on ground) → velocity-based (run/back/side/root)
 */
export function pickMoveAnimation(
  velocity: [number, number, number] | undefined,
  rotation: [number, number, number, number],
  contactTimer: number,
  falling?: boolean,
  jetting?: boolean,
): MoveAnimationResult {
  // 1. Falling overrides everything.
  if (falling) {
    return { animation: "fall", timeScale: 1 };
  }

  if (contactTimer >= 30) {
    return { animation: jetting ? "jet" : "root", timeScale: 1 };
  }
  if (!velocity) {
    return { animation: "root", timeScale: 1 };
  }
  const [vx, vy] = velocity;

  // 3. mWorldToObj.mulV(mVelocity). Torque's yaw matrix (0x54d620,
  // used by Player::setPosition 0x5d97c0) has forward=(sin(yaw),cos(yaw),0).
  // Its inverse projects onto right=(cos,-sin) and forward=(sin,cos).
  // playerYawToQuaternion encodes -yaw about Three Y; recover sin/cos
  // directly from that normalized quaternion without a trig round trip.
  const [, qy, , qw] = rotation;
  const cosY = qw * qw - qy * qy;
  const sinY = -2 * qy * qw;
  const localX = vx * cosY - vy * sinY;
  const localY = vx * sinY + vy * cosY;

  // Dot products against animation direction vectors:
  //   run  dir = (0, 1, 0) → dot = localY
  //   back dir = (0,-1, 0) → dot = -localY
  //   side dir = (-1,0, 0) → dot = -localX (left), +localX (right reversed)
  const forwardDot = localY;
  const backDot = -localY;
  const leftDot = -localX;
  const rightDot = localX;

  const maxDot = Math.max(forwardDot, backDot, leftDot, rightDot);
  if (maxDot <= MOVE_THRESHOLD) {
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

export interface PlayerPose<Key extends string | number = string> {
  /** Unwrapped cycle position for animation triggers (including reverse play). */
  phase?: number;
  /** Client movement alias or the server's exact action-table key. */
  name: string | Key;
  position: number;
  weight: number;
}

/** Sample the body's action and its transition from stream time. Loading a
 * model late must not start a new death, taunt, seated pose or run cycle. */
export function samplePlayerPose<Key extends string | number = string>(
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
  actionName: (index: number) => Key | undefined,
  clipInfo: (
    name: string | Key,
  ) => { duration: number; cyclic: boolean } | undefined,
): PlayerPose<Key>[] {
  const movementPose = (
    m: MoveAnimationResult & { timeSec: number },
    start = m.timeSec,
    sampleTime = now,
  ): PlayerPose<Key> => {
    const info = clipInfo(m.animation);
    const elapsed =
      info && info.duration > 0
        ? (Math.max(0, sampleTime - start) * m.timeScale) / info.duration
        : 0;
    return {
      name: m.animation,
      phase: info?.cyclic ? elapsed : Math.max(0, Math.min(1, elapsed)),
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
  const info = name != null ? clipInfo(name) : undefined;
  const position = wired.actionAtEnd
    ? 1
    : actionStartPosition(wired, now, info?.duration ?? 0);
  const actionStart =
    (wired.actionTimeSec ?? now) -
    (wired.actionAtEnd ? 1 : (wired.actionAnimPos ?? 0)) *
      (info?.duration ?? 0);
  const actionEnd = actionStart + (info?.duration ?? 0);
  const holds =
    wired.actionHoldAtEnd || mounted || (wired.damageState ?? 0) >= 1;
  let current: PlayerPose<Key>,
    previous: PlayerPose<Key> | undefined,
    changedAt: number;
  if (name != null && info && (position < 1 || holds)) {
    current = { name, position, phase: position, weight: 1 };
    changedAt = wired.actionAtEnd ? -Infinity : actionStart;
    previous = movementPose(move, move.timeSec, changedAt);
  } else {
    const start = info ? Math.max(move.timeSec, actionEnd) : move.timeSec;
    current = movementPose(move, start);
    changedAt = start;
    previous =
      info && actionEnd >= move.timeSec
        ? { name: name!, position: 1, weight: 1 }
        : move.previous
          ? movementPose(move.previous, move.previous.timeSec, changedAt)
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
