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
 * Matches the Tribes2.exe binary (build 25034) pickActionAnimation at
 * 0x005d6210. The binary checks in order:
 *   1. mFalling → FallAnim (4)
 *   2. contactTimer < 30 → velocity-based selection (run/back/side/root)
 *   3. jetting → JetAnim (5)
 *   4. else → RootAnim (0)
 *
 * Since we don't have contactTimer, falling=false + no velocity uses root.
 */
export function pickMoveAnimation(
  velocity: [number, number, number] | undefined,
  rotation: [number, number, number, number],
  falling?: boolean,
  jetting?: boolean,
): MoveAnimationResult {
  // Falling overrides everything.
  if (falling) {
    return { animation: "fall", timeScale: 1 };
  }

  if (!velocity) {
    // No velocity data at all — use jetting or idle.
    if (jetting) return { animation: "jet", timeScale: 1 };
    return { animation: "root", timeScale: 1 };
  }

  const [vx, vy, _vz] = velocity;

  // Convert world velocity to player object space using body yaw.
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
    // Below movement threshold — jetting or idle.
    if (jetting) return { animation: "jet", timeScale: 1 };
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
